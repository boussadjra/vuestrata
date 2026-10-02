import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { CLI_PRESENT, loadCli } from './cli'
import { writePayload } from './fixture'

// Loaded rather than imported, so a project without `packages/cli` skips this
// file instead of failing to collect it.
const { diagnose } = await loadCli('src/commands/doctor.mjs')
const { runInit } = await loadCli('src/commands/init.mjs')
const { runUpgrade } = await loadCli('src/commands/upgrade.mjs')
const lockfile = await loadCli('src/lib/lockfile.mjs')
const { blankRegions } = await loadCli('src/lib/registry.mjs')

/**
 * The upgrade contract: an untouched file updates, a file the project added is
 * left alone, and a file the project *edited* is never overwritten.
 *
 * Run against a temp directory with a payload built for the occasion — the
 * alternative is publishing two releases to test an upgrade between them.
 */

const { driftedFiles, emptyLock, hashFor, readLock, writeLock } = lockfile

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
  return loadCli('src/lib/payload.mjs').then((module) => module.createPayloadSource(payload))
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

describe.skipIf(!CLI_PRESENT)('upgrade', () => {
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

  it('refuses to move a project back to an older release', async () => {
    seedProject()
    const lock = readLock(project)
    lock.template = '1.2.0'
    writeLock(project, lock)
    buildPayload('1.1.0', { 'src/ui/Button.vue': 'export const Button = "v2"\n' })

    const payloadSource = await source()
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`)
    })

    try {
      expect(() =>
        runUpgrade({
          root: project,
          version: '1.1.0',
          flags: FLAGS,
          apply: true,
          source: payloadSource,
        }),
      ).toThrow('exit 1')
    } finally {
      exit.mockRestore()
    }

    expect(read('src/ui/Button.vue')).toBe('export const Button = "v1"\n')
    expect(readLock(project).template).toBe('1.2.0')
  })
})

describe.skipIf(!CLI_PRESENT)('diff', () => {
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

// ── Seeded, merged, regions, promotions; doctor and init ─────────────────────

const BARREL = 'src/modules/app/components/ui/index.ts'
const THEMES = 'src/modules/app/config/theme.config.ts'
const SEAM = 'src/modules/app/config/api.overrides.ts'
const STORE = 'src/modules/app/stores/auth.ts'
const TAG = "export { default as UiTag } from './UiTag.vue'"
const BADGE = "export { default as UiBadge } from './UiBadge.vue'"

/** The Ui barrel: `upstream` lines Vuestrata ships, `app` lines a generator added. */
function barrel(app = '', upstream = '') {
  return [
    "export { default as UiButton } from './UiButton.vue'",
    ...(upstream ? [upstream] : []),
    '// vuestrata:ui-components-start',
    '// vuestrata:ui-components-end',
    '// app:ui-components-start',
    ...(app ? [app] : []),
    '// app:ui-components-end',
    '',
  ].join('\n')
}

function upgradeWith(spec: Parameters<typeof writePayload>[1], apply = true) {
  return runUpgrade({
    root: project,
    version: spec.version,
    flags: FLAGS,
    apply,
    source: writePayload(payload, spec),
    migrations: [],
  })
}

describe.skipIf(!CLI_PRESENT)('diff, across every phase', () => {
  it('previews seams, merged files, regions and promotions exactly as upgrade does them', () => {
    const lock = emptyLock('1.1.0')
    lock.files[BARREL] = {
      class: 'merged',
      hash: hashFor(BARREL, barrel(), 'merged'),
      since: '1.0.0',
    }
    writeLock(project, lock)
    write(BARREL, barrel(TAG))
    write(THEMES, '// vuestrata:themes-start\n// vuestrata:themes-end\n')
    write(STORE, 'released\n')

    const upgradeTo = (apply: boolean) =>
      runUpgrade({
        root: project,
        version: '1.2.0',
        flags: FLAGS,
        apply,
        source: writePayload(payload, {
          version: '1.2.0',
          files: { [STORE]: 'fixed\n' },
          merged: { [BARREL]: barrel('', BADGE) },
          seeded: { [SEAM]: 'export default {}\n' },
          regions: { themeRegistry: { themes: ["{ name: 'midnight' },"] } },
        }),
        migrations: [
          {
            version: '1.2.0',
            description: 'promote the auth store',
            steps: [{ kind: 'promote', file: STORE, pristine: [hash('released\n')] }],
          },
        ],
      })

    const preview = upgradeTo(false)
    expect(read(BARREL)).toBe(barrel(TAG))
    expect(read(STORE)).toBe('released\n')
    expect(exists(SEAM)).toBe(false)
    expect(readLock(project).files[STORE]).toBeUndefined()

    const actual = upgradeTo(true)
    for (const key of ['adopted', 'written', 'regions', 'skipped', 'incoming', 'notes']) {
      expect(preview[key]).toEqual(actual[key])
    }
    expect(actual.written.map((entry: { rel: string }) => entry.rel)).toEqual([SEAM, BARREL, STORE])
    expect(actual.regions).toHaveLength(1)
    expect(read(BARREL)).toBe(barrel(TAG, BADGE))
  })
})

describe.skipIf(!CLI_PRESENT)('seeded files', () => {
  beforeEach(() => {
    writeLock(project, emptyLock('1.1.0'))
  })

  it('are written once, then never overwritten', () => {
    upgradeWith({ version: '1.2.0', seeded: { [SEAM]: 'export default { timeoutMs: 10_000 }\n' } })

    expect(read(SEAM)).toBe('export default { timeoutMs: 10_000 }\n')
    expect(readLock(project).files[SEAM]).toEqual({ class: 'seeded', since: '1.2.0' })

    // The project makes it its own; the next release ships a new default.
    write(SEAM, 'export default { timeoutMs: 30_000 }\n')
    const report = upgradeWith({ version: '1.3.0', seeded: { [SEAM]: 'export default {}\n' } })

    expect(read(SEAM)).toBe('export default { timeoutMs: 30_000 }\n')
    expect(report.written).toEqual([])
    expect(report.incoming).toEqual([])
  })

  it("stay deleted once the lock knows them: deleting a seam was the project's call", () => {
    upgradeWith({ version: '1.2.0', seeded: { [SEAM]: 'export default {}\n' } })
    fs.rmSync(path.join(project, SEAM))

    upgradeWith({ version: '1.3.0', seeded: { [SEAM]: 'export default {}\n' } })
    expect(exists(SEAM)).toBe(false)
  })

  it('are adopted, not replaced, when the project already wrote one', () => {
    write(SEAM, 'export default { mine: true }\n')

    const report = upgradeWith({ version: '1.2.0', seeded: { [SEAM]: 'export default {}\n' } })

    expect(read(SEAM)).toBe('export default { mine: true }\n')
    expect(report.adopted).toEqual([{ rel: SEAM, class: 'seeded', reason: 'already here' }])
  })

  it('are not written when ejected', () => {
    const lock = readLock(project)
    lock.ejected = [SEAM]
    writeLock(project, lock)

    upgradeWith({ version: '1.2.0', seeded: { [SEAM]: 'export default {}\n' } })
    expect(exists(SEAM)).toBe(false)
  })
})

describe.skipIf(!CLI_PRESENT)('merged files', () => {
  function seedMerged(contents: string, recordedFrom = barrel()) {
    write(BARREL, contents)
    const lock = emptyLock('1.1.0')
    lock.files[BARREL] = {
      class: 'merged',
      hash: hashFor(BARREL, recordedFrom, 'merged'),
      since: '1.0.0',
    }
    writeLock(project, lock)
  }

  it('are not drift when only their app: regions changed', () => {
    // What `vuestrata add component Tag` does to the barrel.
    seedMerged(barrel(TAG))
    expect(driftedFiles(project, readLock(project))).toEqual([])
  })

  it('keep their app: entries through an upgrade, and stay clean after it', () => {
    seedMerged(barrel(TAG))

    const report = upgradeWith({ version: '1.2.0', merged: { [BARREL]: barrel('', BADGE) } })

    expect(read(BARREL)).toBe(barrel(TAG, BADGE))
    expect(report.written).toEqual([{ rel: BARREL, reason: 'updated, app: regions kept' }])
    expect(report.incoming).toEqual([])
    expect(driftedFiles(project, readLock(project))).toEqual([])
  })

  it('are offered beside an edit outside their app: regions, with the entries already in', () => {
    const edited = barrel(TAG).replace('UiButton', 'UiButtonRestyled')
    seedMerged(edited)

    const report = upgradeWith({ version: '1.2.0', merged: { [BARREL]: barrel('', BADGE) } })

    expect(read(BARREL)).toBe(edited)
    expect(read(`.vuestrata/incoming/${BARREL}`)).toBe(barrel(TAG, BADGE))
    expect(report.incoming).toEqual([
      {
        rel: BARREL,
        incoming: `.vuestrata/incoming/${BARREL}`,
        reason: 'edited outside its app: regions',
      },
    ])
  })

  it('are not written when the release dropped an app: region that holds entries', () => {
    seedMerged(barrel(TAG))
    const withoutRegion = "export { default as UiButton } from './UiButton.vue'\n"

    const report = upgradeWith({ version: '1.2.0', merged: { [BARREL]: withoutRegion } })

    expect(read(BARREL)).toBe(barrel(TAG))
    expect(report.incoming.map((entry: { reason: string }) => entry.reason)).toEqual([
      'app: region removed upstream',
    ])
    expect(report.notes[0].text).toContain(TAG)
  })

  it('upgrade a record from before the file was merged, and rewrite it as merged', () => {
    write(BARREL, barrel())
    const lock = emptyLock('1.1.0')
    lock.files[BARREL] = { class: 'managed', hash: hash(barrel()), since: '1.0.0' }
    writeLock(project, lock)

    const report = upgradeWith({ version: '1.2.0', merged: { [BARREL]: barrel('', BADGE) } })

    expect(read(BARREL)).toBe(barrel('', BADGE))
    expect(report.adopted).toEqual([{ rel: BARREL, class: 'merged', reason: 'reclassified' }])
    expect(readLock(project).files[BARREL].class).toBe('merged')
  })
})

describe.skipIf(!CLI_PRESENT)('merged files, through the generator and the formatter', () => {
  // The one merged file whose markers the formatter moves: once permissions sit
  // in app:permissions they are union members, so oxfmt indents the markers
  // above them. Read from this repository, since a fixture would hide what the
  // real file does — with its app: regions emptied, so a project that has
  // already generated a module reads the same file the template ships.
  const RBAC = 'src/modules/core/lib/rbac/types.ts'
  const pristine = CLI_PRESENT
    ? blankRegions(fs.readFileSync(path.join(process.cwd(), RBAC), 'utf8'))
    : ''

  /** What `vuestrata add module payments` does to it. */
  const generated = pristine.replace(
    '// app:permissions-end',
    "| 'payments:read'\n| 'payments:manage'\n// app:permissions-end",
  )

  /** What `vp fmt` then does: the union's members and the markers before them move in. */
  const formatted = generated
    .replace(/^\/\/ (vuestrata:permissions-(?:start|end)|app:permissions-start)$/gm, '  // $1')
    .replace(/^\| ('payments:\w+')$/gm, '  | $1')

  function seedRbac() {
    write(RBAC, formatted)
    const lock = emptyLock('1.0.0')
    lock.files[RBAC] = { class: 'merged', hash: hashFor(RBAC, pristine, 'merged'), since: '1.0.0' }
    writeLock(project, lock)
  }

  it('models what the formatter does: markers indented, entries still inside app:', () => {
    expect(formatted).toContain('  // vuestrata:permissions-start\n')
    expect(formatted).toContain("  // app:permissions-start\n  | 'payments:read'")
    expect(formatted).not.toBe(generated)
  })

  it('stays clean after the generator and the formatter', () => {
    seedRbac()
    expect(driftedFiles(project, readLock(project))).toEqual([])
  })

  it('is not reported by doctor, and is not offered as an edit by upgrade', () => {
    seedRbac()

    const source = writePayload(payload, { version: '1.0.0', merged: { [RBAC]: pristine } })
    const findings = diagnose({ root: project, version: '1.0.0', source, migrations: [] })
    expect([...findings.notes, ...findings.warnings, ...findings.errors].join('\n')).not.toContain(
      RBAC,
    )

    const report = upgradeWith({ version: '1.0.0', merged: { [RBAC]: pristine } })
    expect(report.incoming).toEqual([])
    expect(read(RBAC)).toBe(formatted)
  })

  it('takes a release change outside the regions, keeping the entries, and stays clean', () => {
    seedRbac()
    const next = pristine.replace('Permission type: a strict', 'Permission type, revised: a strict')
    expect(next).not.toBe(pristine)

    const report = upgradeWith({ version: '1.1.0', merged: { [RBAC]: next } })

    expect(report.incoming).toEqual([])
    expect(report.written).toEqual([{ rel: RBAC, reason: 'updated, app: regions kept' }])
    expect(read(RBAC)).toContain('Permission type, revised: a strict')
    expect(read(RBAC)).toContain("| 'payments:manage'")
    expect(driftedFiles(project, readLock(project))).toEqual([])
  })

  it('still notices a real edit outside the regions', () => {
    seedRbac()
    write(RBAC, formatted.replace("'guest'", "'guest' | 'auditor'"))
    expect(
      driftedFiles(project, readLock(project)).map((entry: { rel: string }) => entry.rel),
    ).toEqual([RBAC])
  })
})

describe.skipIf(!CLI_PRESENT)('doctor', () => {
  const texts = (findings: { notes: string[]; warnings: string[]; errors: string[] }) =>
    [...findings.notes, ...findings.warnings, ...findings.errors].join('\n')

  it('does not report generated app: entries in a merged file as an edit', () => {
    write(BARREL, barrel(TAG))
    const lock = emptyLock('1.2.0')
    lock.files[BARREL] = {
      class: 'merged',
      hash: hashFor(BARREL, barrel(), 'merged'),
      since: '1.2.0',
    }
    writeLock(project, lock)

    const source = writePayload(payload, { version: '1.2.0', merged: { [BARREL]: barrel() } })
    expect(
      texts(diagnose({ root: project, version: '1.2.0', source, migrations: [] })),
    ).not.toContain(BARREL)
  })

  it('notes a merged file edited outside its app: regions', () => {
    write(BARREL, barrel(TAG).replace('UiButton', 'UiButtonRestyled'))
    const lock = emptyLock('1.2.0')
    lock.files[BARREL] = {
      class: 'merged',
      hash: hashFor(BARREL, barrel(), 'merged'),
      since: '1.2.0',
    }
    writeLock(project, lock)

    const { notes } = diagnose({
      root: project,
      version: '1.2.0',
      source: undefined,
      migrations: [],
    })
    expect(notes.join('\n')).toContain(`${BARREL} was edited outside its app: regions`)
  })

  it('errors when a tracked seam is missing, and notes one the next upgrade writes', () => {
    const lock = emptyLock('1.2.0')
    lock.files[SEAM] = { class: 'seeded', since: '1.2.0' }
    writeLock(project, lock)
    const newSeam = 'src/modules/app/config/auth.config.ts'

    const source = writePayload(payload, {
      version: '1.2.0',
      seeded: { [SEAM]: 'export default {}\n', [newSeam]: 'export default {}\n' },
    })
    const findings = diagnose({ root: project, version: '1.2.0', source, migrations: [] })

    expect(findings.errors.join('\n')).toMatch(new RegExp(`${SEAM} is missing`))
    expect(findings.notes.join('\n')).toContain(`${newSeam} is not here yet`)
  })

  it('warns about a shipped file that is untracked here and differs (pending adoption)', () => {
    write(STORE, 'ours\n')
    writeLock(project, emptyLock('1.2.0'))

    const source = writePayload(payload, { version: '1.2.0', files: { [STORE]: 'fixed\n' } })
    const { warnings } = diagnose({ root: project, version: '1.2.0', source, migrations: [] })

    expect(warnings.join('\n')).toMatch(/auth\.ts is shipped by Vuestrata but not tracked.*adopt/s)
  })

  it('notes a promotion the next upgrade will adopt', () => {
    write(STORE, 'released\n')
    writeLock(project, emptyLock('1.1.0'))

    const source = writePayload(payload, { version: '1.2.0', files: { [STORE]: 'fixed\n' } })
    const promotion = { kind: 'promote', file: STORE, pristine: [hash('released\n')] }
    const { notes, warnings } = diagnose({
      root: project,
      version: '1.2.0',
      source,
      migrations: [{ version: '1.2.0', description: 'promote', steps: [promotion] }],
    })

    expect(notes.join('\n')).toContain(`${STORE} is maintained by Vuestrata from 1.2.0`)
    expect(warnings.join('\n')).not.toContain(STORE)
  })

  it('warns, and plans nothing, when the project is newer than the CLI', () => {
    write(STORE, 'ours\n')
    writeLock(project, emptyLock('1.3.0'))

    const source = writePayload(payload, { version: '1.2.0', files: { [STORE]: 'fixed\n' } })
    const { warnings } = diagnose({ root: project, version: '1.2.0', source, migrations: [] })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/at 1\.3\.0, newer than the 1\.2\.0 this CLI ships/)
  })

  it('does not suggest adopting a promoted file the project moved', () => {
    write('vuestrata.config.json', JSON.stringify({ slots: { iconProvider: 'src/icons.ts' } }))
    write('src/icons.ts', 'released\n')
    writeLock(project, emptyLock('1.1.0'))

    const shipped = 'src/modules/app/config/icon-provider.ts'
    const source = writePayload(payload, { version: '1.2.0', files: { [shipped]: 'fixed\n' } })
    const promotion = { kind: 'promote', slot: 'iconProvider', pristine: [hash('released\n')] }
    const { warnings } = diagnose({
      root: project,
      version: '1.2.0',
      source,
      migrations: [{ version: '1.2.0', description: 'promote', steps: [promotion] }],
    })

    const text = warnings.join('\n')
    expect(text).toMatch(/src\/icons\.ts is maintained by Vuestrata.*moved from .*icon-provider/s)
    expect(text).not.toContain('vuestrata adopt src/icons.ts')
  })
})

describe.skipIf(!CLI_PRESENT)('doctor and an rbac.overrides.ts that nothing installs', () => {
  const OVERRIDES = 'src/modules/app/config/rbac.overrides.ts'
  const BACKENDS = 'src/modules/app/state/runtime-backends.ts'

  // The file before the seam existed, and with the two lines that install it.
  const UNWIRED =
    "export const BUILTIN_PERMISSIONS = resolveRolePermissions('super_admin')\n" +
    'export function installRuntimeBackends() {\n  installRbacBackend(rbacBackendState())\n}\n'
  const WIRED = UNWIRED.replace(
    'installRbacBackend(',
    'installRbacConfig(rbacConfig)\n  installRbacBackend(',
  )
  const UNINSTALLED = /rbac\.overrides\.ts exists, but .*runtime-backends\.ts does not install it/

  const warningsOf = (options: { source?: unknown; migrations?: unknown[] } = {}) =>
    diagnose({ root: project, version: '1.2.0', migrations: [], ...options }).warnings.join('\n')

  beforeEach(() => {
    write(OVERRIDES, 'export default defineRbacOverrides({})\n')
  })

  it('warns when the project edited runtime-backends.ts before the seam existed', () => {
    write(BACKENDS, `${UNWIRED}// ours\n`)
    writeLock(project, emptyLock('1.2.0'))

    const text = warningsOf()
    expect(text).toMatch(UNINSTALLED)
    // The change itself, so the warning can be acted on without the docs.
    expect(text).toContain('installRbacConfig(rbacConfig)')
    expect(text).toContain('resolveRbacOverrides(rbacOverrides)')
  })

  it('warns in a project that is not tracked yet', () => {
    write(BACKENDS, UNWIRED)
    expect(warningsOf()).toMatch(UNINSTALLED)
  })

  it('says nothing once the file installs the overrides', () => {
    write(BACKENDS, `${WIRED}// ours\n`)
    writeLock(project, emptyLock('1.2.0'))

    expect(warningsOf()).not.toMatch(UNINSTALLED)
  })

  it('says nothing when the next upgrade replaces the file with the wired copy', () => {
    write(BACKENDS, UNWIRED)
    writeLock(project, emptyLock('1.1.0'))

    const source = writePayload(payload, { version: '1.2.0', files: { [BACKENDS]: WIRED } })
    const promotion = { kind: 'promote', file: BACKENDS, pristine: [hash(UNWIRED)] }
    const migrations = [{ version: '1.2.0', description: 'promote', steps: [promotion] }]

    expect(warningsOf({ source, migrations })).not.toMatch(UNINSTALLED)
  })

  it('still warns when that upgrade will hold the file back as edited', () => {
    write(BACKENDS, `${UNWIRED}// ours\n`)
    writeLock(project, emptyLock('1.1.0'))

    const source = writePayload(payload, { version: '1.2.0', files: { [BACKENDS]: WIRED } })
    const promotion = { kind: 'promote', file: BACKENDS, pristine: [hash(UNWIRED)] }
    const migrations = [{ version: '1.2.0', description: 'promote', steps: [promotion] }]

    expect(warningsOf({ source, migrations })).toMatch(UNINSTALLED)
  })

  it('says nothing without an rbac.overrides.ts to install', () => {
    fs.rmSync(path.join(project, OVERRIDES))
    write(BACKENDS, UNWIRED)
    writeLock(project, emptyLock('1.2.0'))

    expect(warningsOf()).not.toMatch(UNINSTALLED)
  })
})

describe.skipIf(!CLI_PRESENT)('init --force', () => {
  const UI = 'src/modules/app/components/ui'

  it('rebuilds the baselines and keeps the decisions: seeded stays seeded, ejected stays ejected', () => {
    write(`${UI}/UiButton.vue`, '<template><button /></template>\n')
    write(`${UI}/UiTag.vue`, '<template><span /></template>\n')
    write(BARREL, barrel(TAG))
    write('src/modules/app/styles/brand.css', ':root {}\n')
    write(THEMES, "// vuestrata:themes-start\n{ name: 'pro' },\n// vuestrata:themes-end\n")

    const lock = emptyLock('1.1.0')
    lock.files[`${UI}/UiTag.vue`] = { class: 'seeded', hash: 'sha256-generated', since: '1.1.0' }
    lock.ejected = ['src/modules/app/pages/docs.vue']
    writeLock(project, lock)

    runInit({
      root: project,
      version: '1.2.0',
      flags: { force: true, pristine: true, 'no-format': true },
    })

    const rebuilt = readLock(project)
    expect(rebuilt.files[`${UI}/UiTag.vue`]).toEqual({
      class: 'seeded',
      hash: 'sha256-generated',
      since: '1.1.0',
    })
    expect(rebuilt.files[`${UI}/UiButton.vue`]).toMatchObject({ class: 'managed' })
    expect(rebuilt.files[BARREL]).toEqual({
      class: 'merged',
      hash: hashFor(BARREL, barrel(), 'merged'),
      since: '1.2.0',
    })
    expect(rebuilt.files['src/modules/app/styles/brand.css']).toEqual({
      class: 'seeded',
      since: '1.2.0',
    })
    expect(rebuilt.regions[THEMES]['vuestrata:themes']).toBeDefined()
    expect(rebuilt.ejected).toEqual(['src/modules/app/pages/docs.vue'])
  })
})

describe.skipIf(!CLI_PRESENT)('the docs pages a lockfile lists', () => {
  const init = (flags: Record<string, unknown>) =>
    runInit({ root: project, version: '1.2.0', flags: { 'no-format': true, ...flags } })

  beforeEach(() => {
    write('docs/index.md', '# Docs\n')
    write('docs/1.getting-started/1.installation.md', '# Install\n')
  })

  it('are recorded from a pristine tree, which is the template itself', () => {
    init({ pristine: true })

    expect(readLock(project).docs).toEqual([
      'docs/1.getting-started/1.installation.md',
      'docs/index.md',
    ])
  })

  it('are not guessed from a project, whose docs/ may hold pages of its own', () => {
    init({})

    expect(readLock(project).docs).toBeUndefined()
    expect(read('vuestrata.lock.json')).not.toContain('"docs"')
  })

  it('survive a rebuild in a project, without the pages it added since', () => {
    init({ pristine: true })
    write('docs/runbook.md', '# Ours\n')

    init({ force: true })

    expect(readLock(project).docs).not.toContain('docs/runbook.md')
    expect(readLock(project).docs).toContain('docs/index.md')
  })

  it('survive an upgrade', async () => {
    init({ pristine: true })
    buildPayload('1.3.0', {})

    runUpgrade({
      root: project,
      version: '1.3.0',
      flags: FLAGS,
      apply: true,
      source: await source(),
      migrations: [],
    })

    expect(readLock(project).template).toBe('1.3.0')
    expect(readLock(project).docs).toContain('docs/index.md')
  })
})

describe.skipIf(!CLI_PRESENT)('doctor and an auth.config.ts that nothing installs', () => {
  const CONFIG = 'src/modules/app/config/auth.config.ts'
  const SEAMS = 'src/modules/app/bootstrap/seams.ts'

  // The file before the seam existed, and with the call that installs it.
  const UNWIRED = 'export function installSeams(): void {\n  // Intentionally empty.\n}\n'
  const WIRED =
    "import authConfig from '@/config/auth.config'\n" +
    "import { installAuthConfig } from '@/modules/auth'\n\n" +
    'export function installSeams(): void {\n  installAuthConfig(authConfig)\n}\n'
  const UNINSTALLED = /auth\.config\.ts exists, but .*bootstrap\/seams\.ts does not install it/

  const warningsOf = (options: { source?: unknown; migrations?: unknown[] } = {}) =>
    diagnose({ root: project, version: '1.2.0', migrations: [], ...options }).warnings.join('\n')

  beforeEach(() => {
    write(CONFIG, 'export default defineAuthConfig({})\n')
  })

  it('warns when the project edited seams.ts before the seam existed', () => {
    write(SEAMS, `${UNWIRED}// ours\n`)
    writeLock(project, emptyLock('1.2.0'))

    const text = warningsOf()
    expect(text).toMatch(UNINSTALLED)
    // The change itself, so the warning can be acted on without the docs.
    expect(text).toContain('installAuthConfig(authConfig)')
    expect(text).toContain("import authConfig from '@/config/auth.config'")
  })

  it('warns in a project that is not tracked yet', () => {
    write(SEAMS, UNWIRED)
    expect(warningsOf()).toMatch(UNINSTALLED)
  })

  it('says nothing once the file installs the configuration', () => {
    write(SEAMS, `${WIRED}// ours\n`)
    writeLock(project, emptyLock('1.2.0'))

    expect(warningsOf()).not.toMatch(UNINSTALLED)
  })

  it('says nothing when the next upgrade replaces the file with the wired copy', () => {
    write(SEAMS, UNWIRED)
    const lock = emptyLock('1.1.0')
    lock.files[SEAMS] = { class: 'managed', hash: hash(UNWIRED), since: '1.1.0' }
    writeLock(project, lock)

    const source = writePayload(payload, { version: '1.2.0', files: { [SEAMS]: WIRED } })

    expect(warningsOf({ source })).not.toMatch(UNINSTALLED)
  })

  it('still warns when that upgrade will hold the file back as edited', () => {
    write(SEAMS, `${UNWIRED}// ours\n`)
    const lock = emptyLock('1.1.0')
    lock.files[SEAMS] = { class: 'managed', hash: hash(UNWIRED), since: '1.1.0' }
    writeLock(project, lock)

    const source = writePayload(payload, { version: '1.2.0', files: { [SEAMS]: WIRED } })

    expect(warningsOf({ source })).toMatch(UNINSTALLED)
  })

  it('says nothing without an auth.config.ts to install', () => {
    fs.rmSync(path.join(project, CONFIG))
    write(SEAMS, UNWIRED)
    writeLock(project, emptyLock('1.2.0'))

    expect(warningsOf()).not.toMatch(UNINSTALLED)
  })

  it('does not confuse the two seams: each warning is about its own file', () => {
    write(SEAMS, UNWIRED)
    write('src/modules/app/config/rbac.overrides.ts', 'export default defineRbacOverrides({})\n')
    write(
      'src/modules/app/state/runtime-backends.ts',
      'export function installRuntimeBackends() {\n  installRbacConfig(rbacConfig)\n}\n',
    )
    writeLock(project, emptyLock('1.2.0'))

    const text = warningsOf()
    expect(text).toMatch(UNINSTALLED)
    expect(text).not.toMatch(/rbac\.overrides\.ts exists, but/)
  })
})

describe.skipIf(!CLI_PRESENT)('auth.config.ts in an upgrade', () => {
  const CONFIG = 'src/modules/app/config/auth.config.ts'
  const SHIPPED =
    "import { defineAuthConfig } from '~/modules/auth'\n\nexport default defineAuthConfig({})\n"

  const upgradeTo = (version: string) =>
    runUpgrade({
      root: project,
      version,
      flags: FLAGS,
      apply: true,
      source: writePayload(payload, { version, seeded: { [CONFIG]: SHIPPED } }),
      migrations: [],
    })

  it('is written once for a project that has none, and recorded as the project’s', () => {
    writeLock(project, emptyLock('1.1.0'))

    upgradeTo('1.2.0')

    expect(read(CONFIG)).toBe(SHIPPED)
    expect(readLock(project).files[CONFIG]).toEqual({ class: 'seeded', since: '1.2.0' })
  })

  it('is never rewritten once the project has configured it', () => {
    writeLock(project, emptyLock('1.1.0'))
    upgradeTo('1.2.0')
    const configured = SHIPPED.replace('({})', "({ endpoints: { me: '/users/me' } })")
    write(CONFIG, configured)

    upgradeTo('1.3.0')

    expect(read(CONFIG)).toBe(configured)
  })
})
