import fs from 'node:fs'
import path from 'node:path'

import { formatTouchedFiles, logger } from '../lib/cli.mjs'
import {
  createRecord,
  emptyLock,
  LOCKFILE_NAME,
  lockPath,
  readLock,
  regionHash,
  writeLock,
} from '../lib/lockfile.mjs'
import {
  classify,
  collectDocs,
  collectManaged,
  collectSeeded,
  PROJECT_REGISTRIES,
} from '../lib/managed.mjs'
import {
  describeMissingSlot,
  loadManifest,
  MANIFEST_FILENAME,
  missingSlots,
  slot,
} from '../lib/manifest.mjs'
import { regionEntries, regionLines, sentinel, UPSTREAM_SCOPE } from '../lib/registry.mjs'

/**
 * Start tracking an existing project.
 *
 * One file appears: a lockfile saying what came from Vuestrata and what it
 * looked like on arrival — each managed file whole, each merged file with its
 * `app:` regions blanked, and the `vuestrata:` region of each registry.
 *
 * No manifest is written: an untouched project's paths already match the
 * defaults, and a copy of them would only go stale. It stays opt-in.
 *
 * The lockfile has one honest limitation. Run on an already-modified project it
 * records the *current* contents as the baseline, so those edits become
 * invisible to `upgrade`. That is the right trade for adopting the CLI late —
 * the alternative is tracking nothing — and the warning below says so.
 *
 * `--force` rebuilds the baselines, not the decisions behind them. A file
 * already handed to the project stays seeded — a generated `UiTag.vue` sits in
 * the managed `ui/` directory, and re-recording it as managed would put it back
 * in Vuestrata's hands — and an ejected path stays ejected, or the next upgrade
 * would restore it.
 */
export function runInit({ root, version, flags }) {
  const written = []

  const manifest = loadManifest(root)
  const missing = missingSlots(manifest)
  if (missing.length > 0) {
    logger.warn(
      `${missing.length} slot(s) do not resolve. Create ${MANIFEST_FILENAME} with just those ` +
        'slots pointing at your paths, then run `vuestrata doctor`.',
    )
    for (const entry of missing) logger.log(`  · ${describeMissingSlot(entry)}`)
  }

  if (fs.existsSync(lockPath(root)) && !flags.force) {
    logger.info(`${LOCKFILE_NAME} already exists; leaving it alone. Pass --force to rebuild it.`)
  } else {
    const previous = fs.existsSync(lockPath(root)) ? readLock(root, { version }) : undefined
    const lock = emptyLock(version)
    const exists = (rel) => fs.existsSync(path.join(root, rel))

    // Which `docs/` pages are the template's can only be read from a tree that
    // is the template: anywhere else the folder may hold the project's own
    // pages, and listing those would have `eject` delete them. So the list is
    // taken with --pristine, and otherwise kept as it was.
    lock.docs = flags.pristine ? collectDocs(root) : previous?.docs

    if (previous) {
      lock.ejected = [...previous.ejected]
      for (const [rel, record] of Object.entries(previous.files)) {
        if (record.class === 'seeded' && exists(rel)) lock.files[rel] = record
      }
    }

    for (const rel of collectManaged(root)) {
      if (lock.files[rel] || lock.ejected.includes(rel)) continue
      const contents = fs.readFileSync(path.join(root, rel), 'utf8')
      lock.files[rel] = createRecord(rel, contents, classify(rel), version)
    }

    for (const rel of collectSeeded(root)) {
      if (lock.files[rel] || lock.ejected.includes(rel)) continue
      lock.files[rel] = createRecord(rel, '', 'seeded', version)
    }

    for (const registry of PROJECT_REGISTRIES) {
      const rel = slot(manifest, registry.slot)
      if (!exists(rel)) continue

      const name = sentinel(registry.region, UPSTREAM_SCOPE)
      const lines = regionLines(fs.readFileSync(path.join(root, rel), 'utf8'), name)
      if (lines === undefined) continue // `doctor` reports the missing markers

      const entries = regionEntries(lines, { keyedBy: registry.keyedBy })
      lock.regions[rel] = { ...lock.regions[rel], [name]: regionHash(entries) }
    }

    writeLock(root, lock)
    written.push(LOCKFILE_NAME)
    logger.info(`Recorded ${Object.keys(lock.files).length} file(s) at template ${version}.`)

    if (!flags.pristine) {
      logger.warn(
        'Baselines were taken from the files as they are now. If any of them were already ' +
          'modified, an upgrade will consider those edits part of Vuestrata and replace them. ' +
          `Compare against the release you forked from (\`git diff v${version} -- src/\`) if you ` +
          'need to know which.',
      )
    }
  }

  if (written.length === 0) {
    logger.success('Already initialised. Nothing to do.')
    return
  }

  // Written JSON does not match oxfmt's preferences, and an unformatted file
  // would fail `vp check` on a project that never touched it.
  if (!flags['no-format']) formatTouchedFiles(written, root)

  logger.success(`Initialised: ${written.join(', ')}`)
  logger.log('')
  logger.info('Next:  vuestrata doctor')
  logger.log('')
}
