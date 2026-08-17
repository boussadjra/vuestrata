import fs from 'node:fs'
import path from 'node:path'

/**
 * A generator run is planned before it is executed.
 *
 * Every generator builds a `Plan` — the files it would write and the registry
 * edits it would make — and only then applies it. That separation is what makes
 * `--dry-run` honest: it is the same code path, stopped one step earlier, so
 * the preview cannot drift from what a real run does.
 *
 * It also makes the whole thing testable. A test can plan a module into a temp
 * directory and assert on the result without a subprocess.
 *
 * Nothing is written until every step has been validated, so a generator either
 * lands completely or not at all. A half-scaffolded module — files present,
 * registry entry missing — is the exact failure these tools exist to prevent.
 */

export class Plan {
  constructor(root) {
    this.root = root
    /** @type {{ rel: string, contents: string }[]} */
    this.files = []
    /** @type {{ rel: string, description: string, apply: (source: string) => string }[]} */
    this.edits = []
    /** @type {string[]} */
    this.notes = []
  }

  /** Queue a new file. Fails the plan if it already exists (unless `force`). */
  addFile(rel, contents) {
    this.files.push({ rel: normalize(rel), contents })
    return this
  }

  /** Queue an in-place edit of an existing file. */
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
    for (const file of this.files) {
      const full = path.join(this.root, file.rel)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, file.contents)
    }

    for (const edit of this.edits) {
      const full = path.join(this.root, edit.rel)
      const source = fs.readFileSync(full, 'utf8')
      fs.writeFileSync(full, edit.apply(source))
    }

    return { written: this.files.map((f) => f.rel), edited: this.edits.map((e) => e.rel) }
  }

  /** Serialisable shape for `--json`. */
  toJSON() {
    return {
      files: this.files.map((f) => f.rel),
      edits: this.edits.map((e) => ({ file: e.rel, description: e.description })),
      notes: this.notes,
    }
  }
}

function normalize(rel) {
  return rel.replaceAll('\\', '/')
}
