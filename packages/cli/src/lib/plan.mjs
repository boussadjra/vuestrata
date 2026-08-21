import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { loadManifest } from './manifest.mjs'

/**
 * A generator run is planned before it is executed.
 *
 * Every generator builds a `Plan` — the files it would write and the registry
 * edits it would make — and only then applies it. That separation is what makes
 * `--dry-run` honest: it is the same code path, stopped one step earlier, so
 * the preview cannot drift from what a real run does. `diff` and `upgrade` are
 * the same trick again, one step further out.
 *
 * Nothing is written until every step has been validated, so a generator either
 * lands completely or not at all. A half-scaffolded module — files present,
 * registry entry missing — is the exact failure these tools exist to prevent.
 *
 * Every written file declares its ownership class (see UPGRADING.md). There is
 * no default: guessing wrong means silently overwriting someone's code.
 */

export const OWNERSHIP = /** @type {const} */ (['managed', 'seeded'])

export class Plan {
  /** @param {import('./manifest.mjs').Manifest | string} manifestOrRoot */
  constructor(manifestOrRoot) {
    this.manifest =
      typeof manifestOrRoot === 'string' ? loadManifest(manifestOrRoot) : manifestOrRoot
    this.root = this.manifest.root
    /** @type {{ rel: string, contents: string, own: 'managed' | 'seeded' }[]} */
    this.files = []
    /** @type {{ rel: string, description: string, apply: (source: string) => string }[]} */
    this.edits = []
    /** @type {string[]} */
    this.notes = []
  }

  /** Queue a new file. Fails the plan if it already exists (unless `force`). */
  addFile(rel, contents, { own } = {}) {
    if (!OWNERSHIP.includes(own)) {
      throw new Error(
        `addFile("${rel}") must declare ownership: { own: 'managed' } or { own: 'seeded' }. ` +
          'See the ownership note in scripts/gen/lib/plan.mjs.',
      )
    }
    this.files.push({ rel: normalize(rel), contents, own })
    return this
  }

  /**
   * Queue an anchored, idempotent edit. An edit that cannot find its anchor
   * fails loudly rather than appending somewhere plausible.
   */
  addEdit(rel, description, apply) {
    this.edits.push({ rel: normalize(rel), description, apply })
    return this
  }

  /** A human-facing follow-up that the generator deliberately does not automate. */
  addNote(note) {
    this.notes.push(note)
    return this
  }

  /**
   * Check the plan against the filesystem without changing anything.
   * Returns a list of problems; empty means it is safe to apply.
   */
  validate({ force = false } = {}) {
    const problems = []

    for (const file of this.files) {
      const full = path.join(this.root, file.rel)
      if (fs.existsSync(full) && !force) {
        problems.push(`${file.rel} already exists (pass --force to overwrite)`)
      }
    }

    for (const edit of this.edits) {
      const full = path.join(this.root, edit.rel)
      if (!fs.existsSync(full)) {
        problems.push(`${edit.rel} does not exist, so it cannot be edited`)
        continue
      }
      const source = fs.readFileSync(full, 'utf8')
      try {
        const next = edit.apply(source)
        if (next === source) {
          problems.push(`${edit.rel}: ${edit.description} — anchor not found or already applied`)
        }
      } catch (error) {
        problems.push(`${edit.rel}: ${error.message}`)
      }
    }

    return problems
  }

  /** Write everything. Call `validate()` first. */
  apply() {
    /** @type {{ rel: string, own: string, hash: string }[]} */
    const written = []

    for (const file of this.files) {
      const full = path.join(this.root, file.rel)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, file.contents)
      written.push({ rel: file.rel, own: file.own, hash: hashContents(file.contents) })
    }

    for (const edit of this.edits) {
      const full = path.join(this.root, edit.rel)
      const source = fs.readFileSync(full, 'utf8')
      fs.writeFileSync(full, edit.apply(source))
    }

    return {
      written: written.map((f) => f.rel),
      edited: this.edits.map((e) => e.rel),
      /** Provenance for the lockfile: what was written, and what it hashed to. */
      provenance: written,
    }
  }

  /** Serialisable shape for `--json`. */
  toJSON() {
    return {
      files: this.files.map((f) => ({ file: f.rel, own: f.own })),
      edits: this.edits.map((e) => ({ file: e.rel, description: e.description })),
      notes: this.notes,
    }
  }
}

/**
 * Content hash recorded in the lockfile. Line endings are normalised, or a
 * Windows checkout with `core.autocrlf` reports every managed file as edited.
 */
export function hashContents(contents) {
  const normalized = contents.replaceAll('\r\n', '\n')
  return `sha256-${crypto.createHash('sha256').update(normalized).digest('hex')}`
}

/** Hash a file on disk, or `undefined` when it is not there. */
export function hashFile(full) {
  if (!fs.existsSync(full)) return undefined
  return hashContents(fs.readFileSync(full, 'utf8'))
}

function normalize(rel) {
  return rel.replaceAll('\\', '/')
}
