import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// @ts-expect-error - the CLI is plain ESM JavaScript with no type declarations.
import { hashFor } from '../../../packages/cli/src/lib/lockfile.mjs'
// @ts-expect-error - see above.
import { createPayloadSource } from '../../../packages/cli/src/lib/payload.mjs'

/**
 * A throwaway project beside a payload built for the occasion — the
 * alternative is publishing two releases to test an upgrade between them.
 */

export interface Fixture {
  project: string
  payload: string
  write: (rel: string, contents: string) => void
  read: (rel: string) => string
  exists: (rel: string) => boolean
  remove: (rel: string) => void
  cleanup: () => void
}

export function createFixture(): Fixture {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-cli-'))
  const project = path.join(base, 'project')
  const payload = path.join(base, 'payload')
  fs.mkdirSync(project, { recursive: true })

  return {
    project,
    payload,
    write(rel, contents) {
      const full = path.join(project, rel)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, contents)
    },
    read: (rel) => fs.readFileSync(path.join(project, rel), 'utf8'),
    exists: (rel) => fs.existsSync(path.join(project, rel)),
    remove: (rel) => fs.rmSync(path.join(project, rel)),
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  }
}

/** The lockfile's whole-file hash, computed independently of the CLI. */
export function hash(contents: string) {
  return `sha256-${crypto
    .createHash('sha256')
    .update(contents.replaceAll('\r\n', '\n'))
    .digest('hex')}`
}

export interface PayloadSpec {
  version: string
  /** Managed files. */
  files?: Record<string, string>
  /** Merged files — listed under `files` too, as a real v2 index does. */
  merged?: Record<string, string>
  seeded?: Record<string, string>
  /** slot → region → lines inside this release's `vuestrata:` region. */
  regions?: Record<string, Record<string, string[]>>
}

/**
 * Write a payload in the given index format. A v1 index carries `files` alone,
 * so merged files are listed as plain managed ones, the way 1.0.x shipped them.
 */
export function writePayload(dir: string, spec: PayloadSpec, { format = 2 } = {}) {
  const synced = { ...spec.files, ...spec.merged }
  const all = { ...synced, ...spec.seeded }

  for (const [rel, contents] of Object.entries(all)) {
    const full = path.join(dir, 'files', rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, contents)
  }

  const files = Object.fromEntries(
    Object.entries(synced).map(([rel, contents]) => [rel, hash(contents)]),
  )
  const index =
    format === 1
      ? { version: spec.version, files }
      : {
          version: spec.version,
          files,
          seeded: Object.fromEntries(
            Object.entries(spec.seeded ?? {}).map(([rel, contents]) => [rel, hash(contents)]),
          ),
          merged: Object.fromEntries(
            Object.entries(spec.merged ?? {}).map(([rel, contents]) => [
              rel,
              hashFor(rel, contents, 'merged'),
            ]),
          ),
          regions: spec.regions ?? {},
        }

  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
  return createPayloadSource(dir)
}
