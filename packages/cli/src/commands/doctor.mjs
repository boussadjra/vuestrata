import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { logger } from '../lib/cli.mjs'
import { driftedFiles, LOCKFILE_NAME, readLock } from '../lib/lockfile.mjs'
import {
  describeMissingSlot,
  loadManifest,
  MANIFEST_FILENAME,
  missingSlots,
  slot,
  slotPath,
} from '../lib/manifest.mjs'
import { ANCHORED_REGISTRIES, hasSentinel, sentinel, UPSTREAM_SCOPE } from '../lib/registry.mjs'

/**
 * Can this project still be upgraded, and what will an upgrade have to work
 * around?
 *
 * Everything here is knowable before an upgrade rather than during one, which
 * is the point: an upgrade that discovers halfway through that a registry lost
 * its anchors has already written half a release.
 */

export function runDoctor({ root, version, flags }) {
  const findings = { errors: [], warnings: [], notes: [] }

  let manifest
  try {
    manifest = loadManifest(root)
  } catch (error) {
    logger.error(error.message)
    process.exit(1)
  }

  findings.notes.push(
    manifest.present
      ? `${MANIFEST_FILENAME} found; slots resolved from it.`
      : `No ${MANIFEST_FILENAME}; using the default layout. That is correct until you move something.`,
  )

  // ── 1. Do the slots resolve? ─────────────────────────────────────────────
  for (const entry of missingSlots(manifest)) {
    findings.errors.push(describeMissingSlot(entry))
  }

  // ── 2. Do the registries still carry their anchors? ──────────────────────
  for (const target of ANCHORED_REGISTRIES) {
    const full = slotPath(manifest, target.slot)
    if (!fs.existsSync(full)) continue // already reported above

    const source = fs.readFileSync(full, 'utf8')
    const rel = slot(manifest, target.slot)

    for (const scope of [UPSTREAM_SCOPE, 'app']) {
      const name = sentinel(target.region, scope)
      if (hasSentinel(source, name, { comment: target.comment })) continue
      findings.warnings.push(
        `${rel} has no "${name}" region. ` +
          (scope === UPSTREAM_SCOPE
            ? 'An upgrade cannot add entries here and will skip it.'
            : 'Generators cannot add entries here.'),
      )
    }
  }

  // ── 3. What has been edited since it was written? ────────────────────────
  const lockExists = fs.existsSync(path.join(root, LOCKFILE_NAME))
  const lock = readLock(root, { version })

  if (!lockExists) {
    findings.warnings.push(
      `No ${LOCKFILE_NAME}. Nothing is tracked yet, so an upgrade cannot tell your edits ` +
        'from untouched files. Run `vuestrata init` to start tracking.',
    )
  } else {
    const drifted = driftedFiles(root, lock)
    const tracked = Object.keys(lock.files).length

    findings.notes.push(
      `Tracking ${tracked} file(s) from template ${lock.template ?? 'unknown'}` +
        (lock.ejected.length ? `, ${lock.ejected.length} ejected` : '') +
        '.',
    )

    for (const entry of drifted) {
      findings.notes.push(
        entry.status === 'deleted'
          ? `${entry.rel} is tracked but missing. An upgrade will skip it rather than restore it.`
          : `${entry.rel} was edited after Vuestrata wrote it. An upgrade will leave it alone and ` +
              'write the new version to .vuestrata/incoming/ to compare against.',
      )
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────
  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify({ ok: findings.errors.length === 0, ...findings }, null, 2)}\n`,
    )
    process.exit(findings.errors.length === 0 ? 0 : 1)
  }

  for (const note of findings.notes) logger.log(`  · ${String(note)}`)
  for (const warning of findings.warnings) logger.warn(warning)
  for (const error of findings.errors) logger.error(error)

  logger.log('')
  if (findings.errors.length > 0) {
    logger.error(`${findings.errors.length} problem(s) would stop an upgrade.`)
    process.exit(1)
  }
  logger.success(
    findings.warnings.length > 0
      ? `Upgradable, with ${findings.warnings.length} thing(s) an upgrade will skip.`
      : 'Everything an upgrade needs is in place.',
  )
}
