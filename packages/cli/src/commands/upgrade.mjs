import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { formatTouchedFiles, isGitClean, logger } from '../lib/cli.mjs'
import { LOCKFILE_NAME, classifyFile, readLock, writeLock } from '../lib/lockfile.mjs'
import { loadManifest } from '../lib/manifest.mjs'
import { collectMigrations } from '../lib/migrations.mjs'
import { createPayloadSource } from '../lib/payload.mjs'
import { hashContents } from '../lib/plan.mjs'

/**
 * Bring a project up to the Vuestrata release this CLI ships.
 *
 * `diff` and `upgrade` are the same traversal with the writes suppressed, so a
 * preview cannot drift from what a real run does.
 *
 * The target is always this CLI's own version — the payload lives inside the
 * package, so moving to a different release means installing its CLI. Hence no
 * `--to` flag, which could only work for one value anyway.
 */

/** Where a file Vuestrata wanted to change, but could not, is left for review. */
const INCOMING_DIR = '.vuestrata/incoming'

export function runUpgrade({ root, version, flags, apply, source = createPayloadSource() }) {
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

  const manifest = loadManifest(root)
  const lock = readLock(root, { version })
  const from = lock.template ?? 'unknown'

  if (!fs.existsSync(path.join(root, LOCKFILE_NAME))) {
    logger.error(
      `No ${LOCKFILE_NAME}. Without it there is no way to tell your edits from untouched files, ` +
        'and an upgrade would have to either clobber everything or nothing. Run `vuestrata init` first.',
    )
    process.exit(1)
  }

  const migrations = collectMigrations(from, version)
  const report = {
    from,
    to: source.version ?? version,
    migrations: [],
    written: [],
    skipped: [],
    incoming: [],
    ejected: [],
  }

  // ── 1. Migrations ────────────────────────────────────────────────────────
  // These run first: they rewrite structure the payload sync then assumes,
  // such as a renamed anchor or a moved config key.
  for (const migration of migrations) {
    const outcome = runMigration({ migration, root, manifest, apply })
    report.migrations.push(outcome)
  }

  // ── 2. Payload sync ──────────────────────────────────────────────────────
  for (const rel of Object.keys(source.files).sort()) {
    if (lock.ejected.includes(rel)) {
      report.ejected.push(rel)
      continue
    }
    if (!source.has(rel)) continue

    const record = lock.files[rel]
    const incomingContents = source.read(rel)
    const incomingHash = hashContents(incomingContents)
    const full = path.join(root, rel)

    // Not in the lock. Usually a file this release introduces — but if one is
    // already there it belongs to the project, and overwriting it would destroy
    // work the tool has no record of.
    if (!record) {
      if (!fs.existsSync(full)) {
        if (apply) writeFile(full, incomingContents)
        report.written.push({ rel, reason: 'new' })
        if (apply) lock.files[rel] = { class: 'managed', hash: incomingHash, since: version }
        continue
      }

      // Identical already: adopt it rather than report a difference that is not
      // there.
      if (hashContents(fs.readFileSync(full, 'utf8')) === incomingHash) {
        if (apply) lock.files[rel] = { class: 'managed', hash: incomingHash, since: version }
        continue
      }

      const untrackedPath = path.join(root, INCOMING_DIR, rel)
      if (apply) writeFile(untrackedPath, incomingContents)
      report.incoming.push({ rel, incoming: `${INCOMING_DIR}/${rel}`, reason: 'untracked' })
      continue
    }

    // Handed over on first write. Not ours to touch again, ever.
    if (record.class === 'seeded') {
      report.skipped.push({ rel, reason: 'yours' })
      continue
    }

    const status = classifyFile(root, rel, record)

    // Deleting a managed file is a decision; restoring it would overrule it on
    // this upgrade and every one after.
    if (status === 'deleted') {
      report.skipped.push({ rel, reason: 'deleted here' })
      continue
    }

    if (record.hash === incomingHash && status === 'clean') continue

    if (status === 'clean') {
      if (apply) writeFile(full, incomingContents)
      report.written.push({ rel, reason: 'updated' })
      if (apply) lock.files[rel] = { ...record, hash: incomingHash }
      continue
    }

    // Modified here. The edit wins; the new version is left beside it to compare.
    const incomingPath = path.join(root, INCOMING_DIR, rel)
    if (apply) writeFile(incomingPath, incomingContents)
    report.incoming.push({ rel, incoming: `${INCOMING_DIR}/${rel}` })
  }

  // ── 3. Record and report ─────────────────────────────────────────────────
  if (apply) {
    lock.template = source.version ?? version
    writeLock(root, lock)
    if (!flags['no-format'])
      formatTouchedFiles(
        report.written.map((entry) => entry.rel),
        root,
      )
  }

  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, apply, ...report }, null, 2)}\n`)
    return
  }

  printReport(report, { apply })
}

function runMigration({ migration, root, manifest, apply }) {
  const outcome = { version: migration.version, description: migration.description, changed: [] }

  for (const step of migration.steps) {
    const full = path.join(root, step.file(manifest))
    if (!fs.existsSync(full)) continue

    const before = fs.readFileSync(full, 'utf8')
    const after = step.apply(before, manifest)
    if (before === after) continue

    if (apply) fs.writeFileSync(full, after)
    outcome.changed.push(step.file(manifest))
  }

  return outcome
}

function writeFile(full, contents) {
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, contents)
}

function printReport(report, { apply }) {
  const tense = apply ? '' : ' would'

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

  for (const entry of report.written) logger.log(`  write   ${entry.rel}  (${entry.reason})`)
  for (const entry of report.skipped) logger.log(`  skip    ${entry.rel}  (${entry.reason})`)

  if (report.incoming.length > 0) {
    logger.log('')
    logger.warn(
      `${report.incoming.length} file(s) you edited also changed upstream. Your version stays; ` +
        `the new one${tense} be written beside it:`,
    )
    for (const entry of report.incoming) {
      logger.log(`  review  ${entry.rel}`)
      logger.log(`            git diff --no-index ${entry.rel} ${entry.incoming}`)
    }
  }

  logger.log('')
  const total = report.written.length + report.incoming.length
  if (total === 0 && report.migrations.every((m) => m.changed.length === 0)) {
    logger.success('Already up to date.')
    return
  }

  if (apply) {
    logger.success(`Upgraded to ${report.to}. Verify with:  vp check && vpr test --run`)
  } else {
    logger.info(`Nothing written. Run \`vuestrata upgrade\` to apply.`)
  }
  logger.log('')
}
