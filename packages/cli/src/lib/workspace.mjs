import fs from 'node:fs'
import path from 'node:path'

/** Where a version Vuestrata could not install over an edit is left for review. */
export const INCOMING_DIR = '.vuestrata/incoming'

export function incomingPath(rel) {
  return `${INCOMING_DIR}/${rel}`
}

/**
 * A write buffer over a project, so `diff` and `upgrade` are one traversal.
 *
 * Each phase of an upgrade reads what the phases before it wrote: a migration
 * rewrites an anchor that the region sync then looks for, a promotion adopts a
 * file the sync then updates. A preview reading the disk directly would
 * describe a different upgrade from the one that runs. Writes land here, reads
 * see them, and nothing reaches the disk until `flush()`.
 */
export function createWorkspace(root) {
  const pending = new Map()
  const full = (rel) => path.join(root, rel)

  const exists = (rel) => pending.has(rel) || fs.existsSync(full(rel))
  const read = (rel) => (pending.has(rel) ? pending.get(rel) : fs.readFileSync(full(rel), 'utf8'))

  return {
    root,
    exists,
    read,
    /** The contents, or `undefined` when there is no such file. */
    tryRead: (rel) => (exists(rel) ? read(rel) : undefined),
    write: (rel, contents) => {
      pending.set(rel, contents)
    },
    /** Paths written so far, in the order they were first written. */
    written: () => [...pending.keys()],
    /** A blocked upgrade may offer review copies, without applying any release files. */
    flushIncoming: () => {
      const reviewRoot = path.resolve(full(INCOMING_DIR))
      for (const [rel, contents] of pending) {
        const target = path.resolve(full(rel))
        if (!rel.startsWith(`${INCOMING_DIR}/`) || !target.startsWith(`${reviewRoot}${path.sep}`))
          continue
        fs.mkdirSync(path.dirname(target), { recursive: true })
        try {
          fs.writeFileSync(target, contents, { flag: 'wx' })
        } catch (error) {
          if (error.code !== 'EEXIST') throw error
        }
      }
    },
    flush: () => {
      for (const [rel, contents] of pending) {
        fs.mkdirSync(path.dirname(full(rel)), { recursive: true })
        fs.writeFileSync(full(rel), contents)
      }
    },
  }
}
