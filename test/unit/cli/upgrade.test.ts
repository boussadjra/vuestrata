import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

// @ts-expect-error - the CLI is plain ESM JavaScript with no type declarations.
import { runUpgrade } from '../../../packages/cli/src/commands/upgrade.mjs'
// @ts-expect-error - see above.
import { readLock, writeLock, emptyLock } from '../../../packages/cli/src/lib/lockfile.mjs'

/**
 * The upgrade contract: an untouched file updates, a file the project added is
 * left alone, and a file the project *edited* is never overwritten.
 *
 * Run against a temp directory with a payload built for the occasion — the
 * alternative is publishing two releases to test an upgrade between them.
 */

const FLAGS = { 'allow-dirty': true, 'no-format': true }

let project: string
let payload: string

function hash(contents: string) {
  return `sha256-${crypto
    .createHash('sha256')
    .update(contents.replaceAll('\r\n', '\n'))
    .digest('hex')}`
}

/** Write a file into the fake project. */
function write(rel: string, contents: string) {
  const full = path.join(project, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, contents)
}

function read(rel: string) {
  return fs.readFileSync(path.join(project, rel), 'utf8')
}

function exists(rel: string) {
  return fs.existsSync(path.join(project, rel))
}

/** Build a payload directory the CLI can be pointed at. */
function buildPayload(version: string, files: Record<string, string>) {
  const index: { version: string; files: Record<string, string> } = { version, files: {} }

  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(payload, 'files', rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, contents)
    index.files[rel] = hash(contents)
  }

  fs.mkdirSync(payload, { recursive: true })
  fs.writeFileSync(path.join(payload, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
}

function source() {
  // Imported lazily so each test sees the payload it just built.
  // @ts-expect-error - the CLI is plain ESM JavaScript with no type declarations.
  return import('../../../packages/cli/src/lib/payload.mjs').then((module) =>
    module.createPayloadSource(payload),
  )
}

beforeEach(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-upgrade-'))
  project = path.join(base, 'project')
  payload = path.join(base, 'payload')
  fs.mkdirSync(project, { recursive: true })
})

afterEach(() => {
  fs.rmSync(path.dirname(project), { recursive: true, force: true })
})

/**
 * A project at 1.0.0 holding three files: one it never touched, one it
 * restyled, and one that is entirely its own.
 */
function seedProject() {
  const original = 'export const Button = "v1"\n'

  write('src/ui/Button.vue', original)
  write('src/ui/Card.vue', 'export const Card = "v1"\n')
  write('src/ui/Mine.vue', 'export const Mine = "ours"\n')

  const lock = emptyLock('1.0.0')
  lock.files['src/ui/Button.vue'] = { class: 'managed', hash: hash(original), since: '1.0.0' }
  lock.files['src/ui/Card.vue'] = {
    class: 'managed',
    hash: hash('export const Card = "v1"\n'),
    since: '1.0.0',
  }
  writeLock(project, lock)

  return { original }
}

describe('upgrade', () => {
  it('replaces a managed file the project never touched', async () => {
    seedProject()
    buildPayload('1.1.0', {
      'src/ui/Button.vue': 'export const Button = "v2"\n',
      'src/ui/Card.vue': 'export const Card = "v1"\n',
    })

    runUpgrade({
      root: project,
      version: '1.1.0',
      flags: FLAGS,
      apply: true,
      source: await source(),
    })

    expect(read('src/ui/Button.vue')).toBe('export const Button = "v2"\n')

    // And the lock now records the new content, so the next upgrade sees it as
    // clean rather than as an edit.
    const lock = readLock(project)
    expect(lock.files['src/ui/Button.vue'].hash).toBe(hash('export const Button = "v2"\n'))
    expect(lock.template).toBe('1.1.0')
  })

  it('never overwrites a managed file the project edited', async () => {
    seedProject()
    const edited = 'export const Button = "v1 — restyled by us"\n'
    write('src/ui/Button.vue', edited)

    buildPayload('1.1.0', { 'src/ui/Button.vue': 'export const Button = "v2"\n' })

    runUpgrade({
      root: project,
      version: '1.1.0',
      flags: FLAGS,
      apply: true,
      source: await source(),
    })

    expect(read('src/ui/Button.vue')).toBe(edited)

    // The new upstream version is offered rather than imposed.
    expect(exists('.vuestrata/incoming/src/ui/Button.vue')).toBe(true)
    expect(read('.vuestrata/incoming/src/ui/Button.vue')).toBe('export const Button = "v2"\n')

    // Still what upstream last wrote, not the edit — otherwise the edit becomes
    // the baseline and the *next* upgrade replaces it silently.
    const lock = readLock(project)
    expect(lock.files['src/ui/Button.vue'].hash).toBe(hash('export const Button = "v1"\n'))
  })

  it('leaves files the project added alone', async () => {
    seedProject()
    buildPayload('1.1.0', { 'src/ui/Button.vue': 'export const Button = "v2"\n' })

    runUpgrade({
      root: project,
      version: '1.1.0',
      flags: FLAGS,
      apply: true,
      source: await source(),
    })

    expect(read('src/ui/Mine.vue')).toBe('export const Mine = "ours"\n')
    expect(readLock(project).files['src/ui/Mine.vue']).toBeUndefined()
  })

  it('installs a file the release introduces', async () => {
    seedProject()
    buildPayload('1.1.0', { 'src/ui/Badge.vue': 'export const Badge = "new"\n' })

    runUpgrade({
      root: project,
      version: '1.1.0',
      flags: FLAGS,
      apply: true,
      source: await source(),
    })

    expect(read('src/ui/Badge.vue')).toBe('export const Badge = "new"\n')
    expect(readLock(project).files['src/ui/Badge.vue'].class).toBe('managed')
  })

  it('does not restore a managed file the project deleted', async () => {
    seedProject()
    fs.rmSync(path.join(project, 'src/ui/Card.vue'))

    buildPayload('1.1.0', { 'src/ui/Card.vue': 'export const Card = "v2"\n' })

    runUpgrade({
      root: project,
      version: '1.1.0',
      flags: FLAGS,
      apply: true,
      source: await source(),
    })

    expect(exists('src/ui/Card.vue')).toBe(false)
  })

  it('skips anything recorded as ejected', async () => {
    seedProject()
    const lock = readLock(project)
    lock.ejected = ['src/ui/Card.vue']
    fs.rmSync(path.join(project, 'src/ui/Card.vue'))
    writeLock(project, lock)

    buildPayload('1.1.0', { 'src/ui/Card.vue': 'export const Card = "v2"\n' })

    runUpgrade({
      root: project,
      version: '1.1.0',
      flags: FLAGS,
      apply: true,
      source: await source(),
    })

    expect(exists('src/ui/Card.vue')).toBe(false)
  })

  it('never touches a seeded file', async () => {
    seedProject()
    write('src/ui/Brand.css', ':root { --brand: hotpink }\n')

    const lock = readLock(project)
    lock.files['src/ui/Brand.css'] = { class: 'seeded', since: '1.0.0' }
    writeLock(project, lock)

    buildPayload('1.1.0', { 'src/ui/Brand.css': ':root { /* upstream default */ }\n' })

    runUpgrade({
      root: project,
      version: '1.1.0',
      flags: FLAGS,
      apply: true,
      source: await source(),
    })

    expect(read('src/ui/Brand.css')).toBe(':root { --brand: hotpink }\n')
  })

  it('adopts an untracked file that already matches, and offers one that does not', async () => {
    seedProject()
    write('src/ui/Same.vue', 'export const Same = "identical"\n')
    write('src/ui/Clash.vue', 'export const Clash = "ours"\n')

    buildPayload('1.1.0', {
      'src/ui/Same.vue': 'export const Same = "identical"\n',
      'src/ui/Clash.vue': 'export const Clash = "upstream"\n',
    })

    runUpgrade({
      root: project,
      version: '1.1.0',
      flags: FLAGS,
      apply: true,
      source: await source(),
    })

    expect(readLock(project).files['src/ui/Same.vue'].class).toBe('managed')

    // An untracked file that differs is the project's until proven otherwise.
    expect(read('src/ui/Clash.vue')).toBe('export const Clash = "ours"\n')
    expect(exists('.vuestrata/incoming/src/ui/Clash.vue')).toBe(true)
  })
})

describe('diff', () => {
  it('writes nothing at all', async () => {
    const { original } = seedProject()
    buildPayload('1.1.0', {
      'src/ui/Button.vue': 'export const Button = "v2"\n',
      'src/ui/Badge.vue': 'export const Badge = "new"\n',
    })

    runUpgrade({
      root: project,
      version: '1.1.0',
      flags: FLAGS,
      apply: false,
      source: await source(),
    })

    expect(read('src/ui/Button.vue')).toBe(original)
    expect(exists('src/ui/Badge.vue')).toBe(false)
    expect(readLock(project).template).toBe('1.0.0')
  })

  it('reports exactly what upgrade then does', async () => {
    seedProject()
    write('src/ui/Button.vue', 'export const Button = "edited"\n')
    buildPayload('1.1.0', {
      'src/ui/Button.vue': 'export const Button = "v2"\n',
      'src/ui/Card.vue': 'export const Card = "v2"\n',
      'src/ui/Badge.vue': 'export const Badge = "new"\n',
    })

    const payloadSource = await source()
    const captured: Array<Record<string, unknown>> = []
    const original = process.stdout.write.bind(process.stdout)

    // `--json` is the same traversal, machine-readable.
    for (const apply of [false, true]) {
      let output = ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(process.stdout as any).write = (chunk: string) => {
        output += chunk
        return true
      }
      try {
        runUpgrade({
          root: project,
          version: '1.1.0',
          flags: { ...FLAGS, json: true },
          apply,
          source: payloadSource,
        })
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(process.stdout as any).write = original
      }
      captured.push(JSON.parse(output))
    }

    expect(captured).toHaveLength(2)
    const [preview, actual] = captured as [Record<string, unknown>, Record<string, unknown>]

    expect(preview.written).toEqual(actual.written)
    expect(preview.incoming).toEqual(actual.incoming)
    expect(preview.skipped).toEqual(actual.skipped)
  })
})
