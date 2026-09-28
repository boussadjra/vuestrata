import fs from 'node:fs'
import path from 'node:path'

import { classify } from './managed.mjs'
import { hashContents } from './plan.mjs'
import { blankRegions } from './registry.mjs'

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
    regions: Object.fromEntries(
      Object.entries(sortKeys(lock.regions)).map(([rel, regions]) => [rel, sortKeys(regions)]),
    ),
    ejected: [...lock.ejected].sort((a, b) => a.localeCompare(b)),
  }
  fs.writeFileSync(lockPath(root), `${JSON.stringify(ordered, null, 2)}\n`)
  return ordered
}

/**
 * The hash the lock records for `contents` at `rel`.
 *
 * A merged file is hashed with its `app:` region bodies removed: those entries
 * are the project's, so a generator appending one leaves the file clean.
 * Everything else is hashed whole. `cls` defaults to the class Vuestrata gives
 * the path, but callers holding a lock record pass its class — a record written
 * before a file became merged holds a whole-file hash.
 */
export function hashFor(rel, contents, cls = classify(rel)) {
  return hashContents(cls === 'merged' ? blankRegions(contents) : contents)
}

/**
 * A lock record for `contents` arriving at `rel` as `cls`. Seeded records carry
 * no hash: nothing ever compares a file the project owns.
 */
export function createRecord(rel, contents, cls, since) {
  if (cls === 'seeded') return { class: 'seeded', since }
  return { class: cls, hash: hashFor(rel, contents, cls), since }
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
 * How a file compares to what was written there, given its contents —
 * `undefined` when it is not on disk. `seeded` files are expected to have
 * changed, so they are not compared.
 *
 * @returns {'untracked' | 'owned' | 'deleted' | 'clean' | 'modified'}
 */
export function fileStatus(rel, record, contents) {
  if (!record) return 'untracked'
  if (record.class === 'seeded') return 'owned'
  if (contents === undefined) return 'deleted'
  return hashFor(rel, contents, record.class) === record.hash ? 'clean' : 'modified'
}

/** `fileStatus` for the file on disk. */
export function classifyFile(root, rel, record) {
  const full = path.join(root, rel)
  return fileStatus(rel, record, fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : undefined)
}

/** Every managed or merged file whose contents no longer match the lock. */
export function driftedFiles(root, lock) {
  const drifted = []
  for (const [rel, record] of Object.entries(lock.files)) {
    if (lock.ejected.includes(rel)) continue
    const status = classifyFile(root, rel, record)
    if (status === 'modified' || status === 'deleted') drifted.push({ rel, status, record })
  }
  return drifted.sort((a, b) => a.rel.localeCompare(b.rel))
}

/**
 * The hash the lock records for a `vuestrata:` region: the keys of its entries
 * (see `regionEntries`). A removed or added entry is an edit; a re-indent is
 * not, nor is a changed value or comment in `.env.example`.
 */
export function regionHash(entries) {
  return hashContents(entries.map((entry) => entry.key).join('\n'))
}

function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)))
}
