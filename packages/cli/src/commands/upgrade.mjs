import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { formatTouchedFiles, isGitClean, logger } from '../lib/cli.mjs'
import {
  createRecord,
  fileStatus,
  hashFor,
  LOCKFILE_NAME,
  readLock,
  regionHash,
  writeLock,
} from '../lib/lockfile.mjs'
import { PROJECT_REGISTRIES } from '../lib/managed.mjs'
import { loadManifest, slot } from '../lib/manifest.mjs'
import {
  applyMigrations,
  collectMigrations,
  compareVersions,
  selectMigrations,
} from '../lib/migrations.mjs'
import { createPayloadSource } from '../lib/payload.mjs'
import {
  appendToRegion,
  regionEntries,
  regionLines,
  sentinel,
  spliceRegions,
  UPSTREAM_SCOPE,
} from '../lib/registry.mjs'
import { createWorkspace, incomingPath } from '../lib/workspace.mjs'

/**
 * Bring a project up to the Vuestrata release this CLI ships.
 *
 * `diff` and `upgrade` are the same traversal with the writes suppressed, so a
 * preview cannot drift from what a real run does. Every write lands in a
 * workspace buffer that later phases read back (lib/workspace.mjs), and only an
 * applied upgrade flushes it.
 *
 * The target is always this CLI's own version — the payload lives inside the
 * package, so moving to a different release means installing its CLI. Hence no
 * `--to` flag, which could only work for one value anyway.
 *
 * The phases, in order:
 *
 *   1. Migrations: codemods, then promotions and reclassifications.
 *   2. Seeded files, written once: never over a file the lock already knows or
 *      one that was ejected; adopted when already on disk; written when missing.
 *   3. Managed and merged files: replaced when untouched — a merged file with
 *      the project's `app:` regions carried across — and offered beside the
 *      project's copy in .vuestrata/incoming/ when edited.
 *   4. The `vuestrata:` region of each project registry, append-only.
 *   5. Notes: whatever needs a person.
 */

export function runUpgrade({
  root,
  version,
  flags,
  apply,
  source = createPayloadSource(),
  migrations,
}) {
  if (apply && !flags['allow-dirty'] && !isGitClean(root)) {
    logger.error(
      'The working tree has uncommitted changes. Commit or stash them first — `git checkout .` ' +
        'is the whole recovery plan if an upgrade goes wrong, and it only works from a clean tree. ' +
        'Pass --allow-dirty to override.',
    )
    process.exit(1)
  }

  if (!source) {
    logger.error(
      'This CLI was built without a payload, so there is nothing to install. ' +
        'Run `node packages/cli/scripts/build-payload.mjs` if you are working from a checkout.',
    )
    process.exit(1)
  }

  if (!fs.existsSync(path.join(root, LOCKFILE_NAME))) {
    logger.error(
      `No ${LOCKFILE_NAME}. Without it there is no way to tell your edits from untouched files, ` +
        'and an upgrade would have to either clobber everything or nothing. Run `vuestrata init` first.',
    )
    process.exit(1)
  }

  // An older CLI would "upgrade" every clean file back to its own release, and
  // the lock would then describe the older one as what the project received.
  const recorded = readLock(root, { version }).template
  const shipped = source.version ?? version
  if (recorded && compareVersions(recorded, shipped) > 0) {
    logger.error(
      `This project is at ${recorded}, and this CLI installs ${shipped}, which is older. ` +
        `Run \`vp add -D @vuestrata/cli@${recorded}\` (or later) and try again.`,
    )
    process.exit(1)
  }

  const { report, ws, lock, target } = planUpgrade({ root, version, source, migrations })

  // ── 5. Record, then report ───────────────────────────────────────────────
  if (apply) {
    lock.template = target
    ws.flush()
    writeLock(root, lock)
    if (!flags['no-format']) {
      formatTouchedFiles(
        [...report.written, ...report.regions].map((entry) => entry.rel),
        root,
      )
    }
  }

  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, apply, ...report }, null, 2)}\n`)
    return report
  }

  printReport(report, { apply })
  return report
}

/**
 * Everything an upgrade would do, decided and buffered but not written: the
 * report, the workspace holding the new contents, and the lock as it would be.
 *
 * `doctor` calls this too, which is how it can say what the next upgrade will
 * have to leave for a person without a second copy of these rules.
 *
 * `migrations` is the full list to choose from — tests pass their own; the CLI
 * uses the ones it shipped with. Either way only those in range run.
 */
export function planUpgrade({
  root,
  version,
  source,
  migrations,
  manifest = loadManifest(root),
  lock = readLock(root, { version }),
}) {
  const ws = createWorkspace(root)
  const target = source.version ?? version
  const from = lock.template ?? 'unknown'

  const report = {
    from,
    to: target,
    migrations: [],
    adopted: [],
    written: [],
    regions: [],
    skipped: [],
    incoming: [],
    ejected: [],
    notes: [],
  }
  const context = { source, ws, lock, manifest, report, target }

  // ── 1. Migrations ────────────────────────────────────────────────────────
  // These run first: they rewrite structure the later phases assume, such as a
  // renamed anchor, and settle who owns what before anything is compared.
  const selected = migrations
    ? selectMigrations(migrations, from, target)
    : collectMigrations(from, target)
  const migrated = applyMigrations({
    migrations: selected,
    ws,
    lock,
    manifest,
    source,
    version: target,
  })

  report.migrations.push(...migrated.applied)
  report.adopted.push(...migrated.adopted)
  report.incoming.push(...migrated.incoming)
  report.notes.push(...migrated.notes)

  // ── 2–4 ──────────────────────────────────────────────────────────────────
  syncSeeded(context)
  syncFiles({ ...context, handled: migrated.handled })
  syncRegions(context)

  return { report, ws, lock, target }
}

/**
 * Seams arrive once. After that they are the project's, so a tracked seam is
 * skipped even when it is missing — deleting it was the project's call, and
 * `doctor` is where that gets questioned.
 */
function syncSeeded({ source, ws, lock, report, target }) {
  for (const rel of Object.keys(source.seeded).sort()) {
    if (lock.ejected.includes(rel)) {
      report.ejected.push(rel)
      continue
    }
    if (lock.files[rel] || !source.has(rel)) continue

    // Already here but untracked: the project wrote its own, which is the point
    // of a seam. Record it; do not replace it.
    const current = ws.tryRead(rel)
    if (current !== undefined) {
      lock.files[rel] = createRecord(rel, current, 'seeded', target)
      report.adopted.push({ rel, class: 'seeded', reason: 'already here' })
      continue
    }

    const contents = source.read(rel)
    ws.write(rel, contents)
    lock.files[rel] = createRecord(rel, contents, 'seeded', target)
    report.written.push({ rel, reason: 'seeded' })
  }
}

function syncFiles({ source, ws, lock, report, target, handled }) {
  // The new version goes beside the project's copy, never over it.
  const offer = (rel, contents, reason) => {
    ws.write(incomingPath(rel), contents)
    report.incoming.push({ rel, incoming: incomingPath(rel), reason })
  }

  for (const rel of Object.keys(source.files).sort()) {
    if (lock.ejected.includes(rel)) {
      report.ejected.push(rel)
      continue
    }
    if (handled.has(rel) || !source.has(rel)) continue

    const record = lock.files[rel]
    const incoming = source.read(rel)
    const current = ws.tryRead(rel)

    // A record from before a file became merged holds a whole-file hash and is
    // judged by it (`fileStatus` goes by the record's class). The first time
    // the file is found clean it is rewritten as merged.
    const merged = source.classOf(rel) === 'merged' || record?.class === 'merged'
    const cls = merged ? 'merged' : 'managed'
    const withAppRegions = () => (merged ? spliceRegions(incoming, current).contents : incoming)

    // Not in the lock. Usually a file this release introduces — but if one is
    // already there it belongs to the project, and overwriting it would destroy
    // work the tool has no record of.
    if (!record) {
      if (current === undefined) {
        ws.write(rel, incoming)
        lock.files[rel] = createRecord(rel, incoming, cls, target)
        report.written.push({ rel, reason: 'new' })
        continue
      }

      // Identical already (outside its app: regions, for a merged file): adopt
      // it rather than report a difference that is not there.
      if (hashFor(rel, current, cls) === hashFor(rel, incoming, cls)) {
        lock.files[rel] = createRecord(rel, current, cls, target)
        report.adopted.push({ rel, class: cls, reason: 'identical' })
        continue
      }

      offer(rel, withAppRegions(), 'untracked')
      continue
    }

    // Handed over on first write. Not ours to touch again, ever.
    if (record.class === 'seeded') {
      report.skipped.push({ rel, reason: 'yours' })
      continue
    }

    const status = fileStatus(rel, record, current)

    // Deleting a managed file is a decision; restoring it would overrule it on
    // this upgrade and every one after.
    if (status === 'deleted') {
      report.skipped.push({ rel, reason: 'deleted here' })
      continue
    }

    // Modified here. The edit wins. For a merged file the copy offered already
    // holds the project's app: entries, so comparing shows only what differs.
    if (status === 'modified') {
      offer(rel, withAppRegions(), merged ? 'edited outside its app: regions' : 'edited')
      continue
    }

    if (!merged) {
      const hash = hashFor(rel, incoming, 'managed')
      if (record.hash === hash) continue

      ws.write(rel, incoming)
      lock.files[rel] = { ...record, hash }
      report.written.push({ rel, reason: 'updated' })
      continue
    }

    // Unchanged upstream outside the app: regions. Splicing anyway would write
    // the release's column-0 markers over the ones the project's formatter
    // indented — a rewrite on every upgrade that the next format undoes.
    if (record.class === 'merged' && record.hash === hashFor(rel, incoming, 'merged')) continue

    const { contents, warnings } = spliceRegions(incoming, current)
    const stranded = warnings.filter((warning) => warning.lines.length > 0)

    // This release dropped an app: region the project has entries in. Writing
    // it would delete them, so it is offered instead, with the entries named.
    if (stranded.length > 0) {
      offer(rel, contents, 'app: region removed upstream')
      for (const warning of stranded) {
        report.notes.push({
          rel,
          text:
            `${rel}: this release has no ${warning.region} region, and yours holds ` +
            `${warning.lines.join(' / ')}. Move those entries somewhere that survives, then take ` +
            `the new version from ${incomingPath(rel)}.`,
        })
      }
      continue
    }

    for (const warning of warnings) {
      report.notes.push({
        rel,
        text: `${rel}: the empty ${warning.region} region is gone in this release.`,
      })
    }

    if (record.class !== 'merged') {
      report.adopted.push({ rel, class: 'merged', reason: 'reclassified' })
    }

    // Line endings are not a change worth writing a file for.
    if (contents.replaceAll('\r\n', '\n') !== current.replaceAll('\r\n', '\n')) {
      ws.write(rel, contents)
      report.written.push({ rel, reason: 'updated, app: regions kept' })
    }
    lock.files[rel] = { ...record, class: 'merged', hash: hashFor(rel, contents, 'merged') }
  }
}

/**
 * Append what a release adds to each registry's `vuestrata:` region, and
 * nothing else: an entry already anywhere in the file is not added again, and
 * nothing is removed or reordered, so entries the release no longer lists stay.
 *
 * The lock records each region's hash as last written. A region that no longer
 * matches was edited here — most likely an entry removed on purpose, which
 * appending would undo — so it is skipped with a note instead. A lock from
 * before regions were recorded has nothing to compare, so the region is taken
 * as it stands and recorded from then on.
 */
function syncRegions({ source, ws, lock, manifest, report }) {
  for (const registry of PROJECT_REGISTRIES) {
    const upstream = source.regions?.[registry.slot]?.[registry.region]
    if (!upstream) continue // a v1 payload, or nothing shipped for this registry

    const rel = slot(manifest, registry.slot)
    const name = sentinel(registry.region, UPSTREAM_SCOPE)
    const options = { keyedBy: registry.keyedBy }
    const shipped = regionEntries(upstream, options)

    const current = ws.tryRead(rel)
    const lines = current === undefined ? undefined : regionLines(current, name)

    if (lines === undefined) {
      if (shipped.length > 0) {
        report.notes.push({
          rel,
          text:
            `${rel} has no ${name} region, so what this release adds there was not written: ` +
            `${describeEntries(shipped)}. Restore the markers (\`vuestrata doctor\` shows which) ` +
            'and upgrade again, or add those by hand.',
        })
      }
      continue
    }

    const entries = regionEntries(lines, options)
    const hash = regionHash(entries)
    const recorded = lock.regions[rel]?.[name]

    const present = new Set(regionEntries(current.split(/\r?\n/), options).map((e) => e.key))
    const missing = shipped.filter((entry) => !present.has(entry.key))

    if (recorded !== undefined && recorded !== hash) {
      if (missing.length > 0) {
        report.skipped.push({ rel, reason: `${name} edited here` })
        report.notes.push({
          rel,
          text:
            `${name} in ${rel} was edited since the last upgrade, so it was left alone. This ` +
            `release adds ${describeEntries(missing)}. Add what you want by hand, then run ` +
            `\`vuestrata adopt ${rel}\` so later releases can append again.`,
        })
      }
      continue
    }

    if (missing.length === 0) {
      recordRegion(lock, rel, name, hash)
      continue
    }

    ws.write(rel, appendToRegion(current, name, missing, options))
    recordRegion(lock, rel, name, regionHash([...entries, ...missing]))
    report.regions.push({ rel, region: name, added: missing.map((entry) => entry.key) })
  }
}

function recordRegion(lock, rel, name, hash) {
  lock.regions[rel] = { ...lock.regions[rel], [name]: hash }
}

function describeEntries(entries) {
  return entries.map((entry) => entry.key).join(', ')
}

function printReport(report, { apply }) {
  const outcome = apply ? 'has been written beside it' : 'would be written beside it'

  logger.log('')
  logger.info(`${report.from} → ${report.to}`)
  logger.log('')

  for (const migration of report.migrations) {
    const count = migration.changed.length
    logger.log(
      `  migrate ${migration.version}  ${migration.description}` +
        (count === 0 ? '  (nothing to change)' : `  (${count} file(s))`),
    )
    for (const file of migration.changed) logger.log(`            ${file}`)
  }

  for (const entry of report.adopted) {
    logger.log(`  adopt   ${entry.rel}  (${entry.class}: ${entry.reason})`)
  }
  for (const entry of report.written) logger.log(`  write   ${entry.rel}  (${entry.reason})`)
  for (const entry of report.regions) {
    const count = entry.added.length
    logger.log(
      `  append  ${entry.rel}  (${entry.region}: ${count} ${count === 1 ? 'entry' : 'entries'})`,
    )
    for (const key of entry.added) logger.log(`            ${key}`)
  }
  for (const entry of report.skipped) logger.log(`  skip    ${entry.rel}  (${entry.reason})`)

  if (report.incoming.length > 0) {
    logger.log('')
    logger.warn(
      `${report.incoming.length} file(s) could not be installed over your copy. Yours stays; ` +
        `the new one ${outcome}:`,
    )
    for (const entry of report.incoming) {
      logger.log(`  review  ${entry.rel}${entry.reason ? `  (${entry.reason})` : ''}`)
      logger.log(`            git diff --no-index ${entry.rel} ${entry.incoming}`)
    }
  }

  if (report.notes.length > 0) {
    logger.log('')
    logger.info('Needs a person:')
    for (const note of report.notes) logger.log(`  · ${note.text}`)
  }

  logger.log('')
  const total =
    report.adopted.length +
    report.written.length +
    report.regions.length +
    report.incoming.length +
    report.migrations.reduce((sum, migration) => sum + migration.changed.length, 0)

  if (total === 0) {
    if (report.notes.length === 0) logger.success('Already up to date.')
    else logger.info('Nothing to install; the notes above are for you.')
    logger.log('')
    return
  }

  if (apply) {
    logger.success(`Upgraded to ${report.to}. Verify with:  vp check && vpr test --run`)
  } else {
    logger.info(`Nothing written. Run \`vuestrata upgrade\` to apply.`)
  }
  logger.log('')
}
