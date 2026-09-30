import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { logger } from '../lib/cli.mjs'
import {
  createRecord,
  hashFor,
  LOCKFILE_NAME,
  lockPath,
  readLock,
  regionHash,
  writeLock,
} from '../lib/lockfile.mjs'
import { classify, PROJECT_REGISTRIES } from '../lib/managed.mjs'
import { loadManifest, slot } from '../lib/manifest.mjs'
import { createPayloadSource } from '../lib/payload.mjs'
import { regionEntries, regionLines, sentinel, UPSTREAM_SCOPE } from '../lib/registry.mjs'
import { incomingPath } from '../lib/workspace.mjs'

/**
 * `vuestrata adopt <path...>` — "I merged this by hand; count it as clean."
 *
 * The way out of `.vuestrata/incoming/`. When an upgrade could not install a
 * file over an edit, or a promotion found the project's copy changed, the
 * project merges what it wants from the new version and runs this. The file's
 * current hash becomes its baseline for its class: the whole file for managed,
 * the file with its `app:` regions blanked for merged. Given a registry, it
 * records that registry's `vuestrata:` region instead, so region sync appends
 * to it again.
 *
 * Adopting says the file now matches Vuestrata. A difference left in it will
 * pass for Vuestrata's from then on, and go the next time the file changes
 * upstream — so this warns when the file still differs from the release. A
 * change worth keeping belongs in a seam.
 */
export function runAdopt({ root, version, positional, flags, source = createPayloadSource() }) {
  if (positional.length === 0) {
    logger.error(
      '`adopt` needs at least one path, e.g. `vuestrata adopt src/modules/app/components/ui/index.ts`.',
    )
    process.exit(1)
  }

  if (!fs.existsSync(lockPath(root))) {
    logger.error(
      `No ${LOCKFILE_NAME}, so nothing is tracked to adopt into. Run \`vuestrata init\` first.`,
    )
    process.exit(1)
  }

  const manifest = loadManifest(root)
  const lock = readLock(root, { version })
  const result = adoptPaths({ root, lock, manifest, source, version, paths: positional })
  const ok = result.problems.length === 0
  const write = ok && !flags['dry-run']

  // All or nothing: a half-applied adopt would leave the reader unsure which
  // of the paths they named are now baselines.
  if (write) writeLock(root, lock)

  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ ok, written: write, ...result }, null, 2)}\n`)
    process.exit(ok ? 0 : 1)
  }

  for (const problem of result.problems) logger.error(problem)
  if (!ok) process.exit(1)

  if (flags['dry-run']) logger.info('Dry run — nothing written.\n')
  for (const entry of result.adopted) {
    logger.log(`  adopt   ${entry.rel}  (${entry.region ?? entry.class})`)
  }
  for (const warning of result.warnings) logger.warn(warning)

  const leftovers = result.adopted
    .map((entry) => incomingPath(entry.rel))
    .filter((rel) => fs.existsSync(path.join(root, rel)))
  if (leftovers.length > 0) {
    logger.log('')
    logger.info('The incoming copies have served their purpose and can be deleted:')
    for (const rel of leftovers) logger.log(`  ${rel}`)
  }

  logger.log('')
  if (write) logger.success(`Recorded in ${LOCKFILE_NAME}.`)
  logger.log('')
}

/**
 * Record each path as clean for its class, in `lock` (in memory). Returns what
 * was adopted, the paths that could not be, and the warnings worth reading.
 */
export function adoptPaths({ root, lock, manifest, source, version, paths }) {
  const adopted = []
  const problems = []
  const warnings = []

  for (const input of paths) {
    const rel = toRel(root, input)
    const full = rel === undefined ? undefined : path.join(root, rel)

    if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      problems.push(`${input} is not a file in this project.`)
      continue
    }

    const contents = fs.readFileSync(full, 'utf8')

    const registries = PROJECT_REGISTRIES.filter(
      (registry) => slot(manifest, registry.slot) === rel,
    )
    if (registries.length > 0) {
      for (const registry of registries) {
        const name = sentinel(registry.region, UPSTREAM_SCOPE)
        const lines = regionLines(contents, name)
        if (lines === undefined) {
          problems.push(`${rel} has no ${name} region to record. Restore its markers first.`)
          continue
        }
        const entries = regionEntries(lines, { keyedBy: registry.keyedBy })
        lock.regions[rel] = { ...lock.regions[rel], [name]: regionHash(entries) }
        adopted.push({ rel, class: 'registry', region: name })
      }
      continue
    }

    const record = lock.files[rel]
    if (record?.class === 'seeded') {
      warnings.push(`${rel} is seeded — already yours, and never compared. Nothing to adopt.`)
      continue
    }

    const cls = shippedClass(rel, source) ?? record?.class
    if (!cls) {
      problems.push(
        `${rel} is not a file Vuestrata ships, so there is nothing to adopt: a file the lock ` +
          'does not track is already yours.',
      )
      continue
    }

    if (lock.ejected.includes(rel)) {
      lock.ejected = lock.ejected.filter((ejected) => ejected !== rel)
      warnings.push(
        `${rel} was recorded as ejected; it is tracked again, and upgrades will update it.`,
      )
    }

    lock.files[rel] = createRecord(rel, contents, cls, record?.since ?? version)
    adopted.push({ rel, class: cls })

    if (cls === 'seeded' || !source || !Object.hasOwn(source.files, rel) || !source.has(rel)) {
      continue
    }

    if (hashFor(rel, contents, cls) !== hashFor(rel, source.read(rel), cls)) {
      warnings.push(
        `${rel} still differs from the version ${source.version} ships` +
          (cls === 'merged' ? ' outside its app: regions' : '') +
          ". From now on those differences count as Vuestrata's, and the next upgrade that " +
          'changes this file replaces them. Keep what you need in a seam instead.',
      )
    }
  }

  return { adopted, problems, warnings }
}

/**
 * The class this release gives `rel`: the payload's word when there is one,
 * else the CLI's own lists (the same version, by construction). A v1 payload
 * predates merged files, so the lists overrule it there.
 */
function shippedClass(rel, source) {
  const listed = classify(rel) ?? undefined
  if (!source) return listed
  const cls = source.classOf(rel)
  return cls === 'managed' && listed === 'merged' ? 'merged' : cls
}

function toRel(root, input) {
  const rel = path.relative(root, path.resolve(root, input))
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return undefined
  return rel.split(path.sep).join('/')
}
