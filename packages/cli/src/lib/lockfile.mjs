import fs from 'node:fs'
import path from 'node:path'

import { hashContents } from './plan.mjs'

/**
 * What this project received from Vuestrata, and what it hashed to on arrival.
 *
 * The hash is what lets `upgrade` tell an untouched file from an edited one.
 * See UPGRADING.md. Committed, because it describes the project's relationship
 * to upstream.
 */

export const LOCKFILE_NAME = 'vuestrata.lock.json'

export function emptyLock(version) {
  return {
    /** Template version this project last synchronised with. */
    template: version,
    /** rel path → { class, hash, since } */
    files: {},
    /** rel path → { region name → hash }, for anchored edits. */
    regions: {},
    /** Paths deliberately removed, so an upgrade never restores them. */
    ejected: [],
  }
}

export function lockPath(root) {
  return path.join(root, LOCKFILE_NAME)
}

export function readLock(root, { version } = {}) {
  const file = lockPath(root)
  if (!fs.existsSync(file)) return emptyLock(version)

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return {
      ...emptyLock(version),
      ...parsed,
      files: parsed.files ?? {},
      regions: parsed.regions ?? {},
      ejected: parsed.ejected ?? [],
    }
  } catch (error) {
    throw new Error(`${LOCKFILE_NAME} is not valid JSON: ${error.message}`)
  }
}

export function writeLock(root, lock) {
  const ordered = {
    template: lock.template,
    files: sortKeys(lock.files),
    regions: sortKeys(lock.regions),
    ejected: [...lock.ejected].sort((a, b) => a.localeCompare(b)),
  }
  fs.writeFileSync(lockPath(root), `${JSON.stringify(ordered, null, 2)}\n`)
  return ordered
}

/** Record what a `Plan.apply()` just wrote. */
export function recordProvenance(lock, provenance, version) {
  for (const entry of provenance) {
    lock.files[entry.rel] = {
      class: entry.own,
      hash: entry.hash,
      since: lock.files[entry.rel]?.since ?? version,
    }
  }
  return lock
}

/**
 * How a managed file on disk compares to what was written there. `seeded` files
 * are expected to have changed, so they are not compared.
 */
export function classifyFile(root, rel, record) {
  if (!record) return 'untracked'
  if (record.class === 'seeded') return 'owned'

  const full = path.join(root, rel)
  if (!fs.existsSync(full)) return 'deleted'

  const actual = hashContents(fs.readFileSync(full, 'utf8'))
  return actual === record.hash ? 'clean' : 'modified'
}

/** Every managed file whose contents no longer match the lock. */
export function driftedFiles(root, lock) {
  const drifted = []
  for (const [rel, record] of Object.entries(lock.files)) {
    if (lock.ejected.includes(rel)) continue
    const status = classifyFile(root, rel, record)
    if (status === 'modified' || status === 'deleted') drifted.push({ rel, status, record })
  }
  return drifted.sort((a, b) => a.rel.localeCompare(b.rel))
}

function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)))
}
