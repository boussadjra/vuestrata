import fs from 'node:fs'
import path from 'node:path'

import { formatTouchedFiles, logger } from '../lib/cli.mjs'
import { emptyLock, LOCKFILE_NAME, lockPath, writeLock } from '../lib/lockfile.mjs'
import { collectManaged, SEEDED_FILES } from '../lib/managed.mjs'
import {
  describeMissingSlot,
  loadManifest,
  MANIFEST_FILENAME,
  missingSlots,
} from '../lib/manifest.mjs'
import { hashContents } from '../lib/plan.mjs'

/**
 * Start tracking an existing project.
 *
 * One file appears: a lockfile saying what came from Vuestrata and what it
 * looked like on arrival.
 *
 * No manifest is written: an untouched project's paths already match the
 * defaults, and a copy of them would only go stale. It stays opt-in.
 *
 * The lockfile has one honest limitation. Run on an already-modified project it
 * records the *current* contents as the baseline, so those edits become
 * invisible to `upgrade`. That is the right trade for adopting the CLI late —
 * the alternative is tracking nothing — and the warning below says so.
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
    const lock = emptyLock(version)

    for (const rel of collectManaged(root)) {
      lock.files[rel] = {
        class: 'managed',
        hash: hashContents(fs.readFileSync(path.join(root, rel), 'utf8')),
        since: version,
      }
    }

    for (const rel of SEEDED_FILES) {
      if (!fs.existsSync(path.join(root, rel))) continue
      lock.files[rel] = { class: 'seeded', since: version }
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
