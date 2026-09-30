import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

// @ts-expect-error - the CLI is plain ESM JavaScript with no type declarations.
import { adoptPaths } from '../../../packages/cli/src/commands/adopt.mjs'
// @ts-expect-error - see above.
import { planUpgrade, runUpgrade } from '../../../packages/cli/src/commands/upgrade.mjs'
// @ts-expect-error - see above.
import * as lockfile from '../../../packages/cli/src/lib/lockfile.mjs'
// @ts-expect-error - see above.
import { loadManifest } from '../../../packages/cli/src/lib/manifest.mjs'
// @ts-expect-error - see above.
import * as migrations from '../../../packages/cli/src/lib/migrations.mjs'
import { createFixture, type Fixture, hash, writePayload } from './fixture'

/**
 * Migrations that change who owns a file rather than what is in it.
 *
 * A promotion hands Vuestrata a file the project has always owned; getting it
 * wrong either strands a fix outside the upgrade path or overwrites someone's
 * work. So the rule is narrow: adopt only a copy that provably matches a
 * release, and offer everything else beside it.
 */

const { emptyLock, hashFor, readLock, writeLock } = lockfile
const {
  compareVersions,
  inMigrationRange,
  loadAllMigrations,
  selectMigrations,
  validateMigration,
} = migrations

const FLAGS = { 'allow-dirty': true, 'no-format': true }

const STORE = 'src/modules/app/stores/auth.ts'
const RELEASED = 'export const useAuthStore = "as released"\n'
const FIXED = 'export const useAuthStore = "with the fix"\n'

let fixture: Fixture

beforeEach(() => {
  fixture = createFixture()
})

afterEach(() => {
  fixture.cleanup()
})

interface Step {
  kind?: string
  [key: string]: unknown
}

function migration(version: string, steps: Step[], description = `migrate to ${version}`) {
  return { version, description, steps }
}

function upgrade({
  version = '1.2.0',
  files = { [STORE]: FIXED },
  steps,
  apply = true,
}: {
  version?: string
  files?: Record<string, string>
  steps: Step[]
  apply?: boolean
}) {
  return runUpgrade({
    root: fixture.project,
    version,
    flags: FLAGS,
    apply,
    source: writePayload(fixture.payload, { version, files }),
    migrations: [migration('1.2.0', steps)],
  })
}

const promote = (extra: Record<string, unknown> = {}) => ({
  kind: 'promote',
  file: STORE,
  pristine: [hash(RELEASED)],
  ...extra,
})

describe('promote', () => {
  beforeEach(() => {
    writeLock(fixture.project, emptyLock('1.1.0'))
  })

  it('adopts a pristine copy, and the same upgrade brings it up to date', () => {
    fixture.write(STORE, RELEASED)

    const report = upgrade({ steps: [promote()] })

    expect(report.adopted).toEqual([{ rel: STORE, class: 'managed', reason: 'promoted' }])
    expect(fixture.read(STORE)).toBe(FIXED)
    expect(readLock(fixture.project).files[STORE]).toMatchObject({
      class: 'managed',
      hash: hash(FIXED),
    })
  })

  it('offers an edited copy beside it instead, and says what to do', () => {
    const edited = 'export const useAuthStore = "ours"\n'
    fixture.write(STORE, edited)

    const report = upgrade({ steps: [promote()] })

    expect(fixture.read(STORE)).toBe(edited)
    expect(fixture.read(`.vuestrata/incoming/${STORE}`)).toBe(FIXED)
    expect(readLock(fixture.project).files[STORE]).toBeUndefined()

    // Reported once, as a promotion — not a second time by the payload sync.
    expect(report.incoming).toEqual([
      { rel: STORE, incoming: `.vuestrata/incoming/${STORE}`, reason: 'promoted' },
    ])
    expect(report.notes).toHaveLength(1)
    expect(report.notes[0].text).toMatch(/vuestrata adopt src\/modules\/app\/stores\/auth\.ts/)
  })

  it('uses the note the migration wrote, when it wrote one', () => {
    fixture.write(STORE, 'export const useAuthStore = "ours"\n')
    const report = upgrade({ steps: [promote({ note: 'Move your changes into auth.config.ts.' })] })
    expect(report.notes.map((note: { text: string }) => note.text)).toEqual([
      'Move your changes into auth.config.ts.',
    ])
  })

  it('adopts a copy that already matches this release', () => {
    fixture.write(STORE, FIXED)
    const report = upgrade({ steps: [promote()] })
    expect(report.adopted).toEqual([{ rel: STORE, class: 'managed', reason: 'promoted' }])
    expect(report.written).toEqual([])
  })

  it('installs the file when the project does not have it', () => {
    const report = upgrade({ steps: [promote()] })
    expect(report.written).toEqual([{ rel: STORE, reason: 'new' }])
    expect(fixture.read(STORE)).toBe(FIXED)
  })

  it('does nothing the second time', () => {
    fixture.write(STORE, RELEASED)
    upgrade({ steps: [promote()] })

    // Re-running the same migration — what the next prerelease does.
    const lock = readLock(fixture.project)
    lock.template = '1.2.0-alpha.0'
    writeLock(fixture.project, lock)

    const again = upgrade({ steps: [promote()] })
    expect(again.adopted).toEqual([])
    expect(again.written).toEqual([])
    expect(fixture.read(STORE)).toBe(FIXED)
  })

  it('never adopts a file the project moved, and never installs a second copy', () => {
    fixture.write(
      'vuestrata.config.json',
      JSON.stringify({ slots: { iconProvider: 'src/icons.ts' } }),
    )
    fixture.write('src/icons.ts', RELEASED)

    const shipped = 'src/modules/app/config/icon-provider.ts'
    const report = upgrade({
      files: { [shipped]: FIXED },
      steps: [{ kind: 'promote', slot: 'iconProvider', pristine: [hash(RELEASED)] }],
    })

    expect(fixture.exists(shipped)).toBe(false)
    expect(fixture.read('src/icons.ts')).toBe(RELEASED)
    expect(fixture.read('.vuestrata/incoming/src/icons.ts')).toBe(FIXED)
    expect(report.notes[0].text).toMatch(/keeps it at src\/icons\.ts/)
  })

  it('does not install a second copy at a later release either', () => {
    fixture.write(
      'vuestrata.config.json',
      JSON.stringify({ slots: { iconProvider: 'src/icons.ts' } }),
    )
    fixture.write('src/icons.ts', RELEASED)

    const shipped = 'src/modules/app/config/icon-provider.ts'
    upgrade({
      files: { [shipped]: FIXED },
      steps: [{ kind: 'promote', slot: 'iconProvider', pristine: [hash(RELEASED)] }],
    })
    expect(readLock(fixture.project).ejected).toContain(shipped)

    // The 1.2.0 migration is out of range now; only the record says no.
    const later = 'export const useIcons = "1.3.0"\n'
    const report = runUpgrade({
      root: fixture.project,
      version: '1.3.0',
      flags: FLAGS,
      apply: true,
      source: writePayload(fixture.payload, { version: '1.3.0', files: { [shipped]: later } }),
      migrations: [migration('1.2.0', [])],
    })

    expect(fixture.exists(shipped)).toBe(false)
    expect(report.written).toEqual([])
    expect(fixture.read('src/icons.ts')).toBe(RELEASED)
  })

  it('does nothing while its pending guard says there is nothing to do', () => {
    fixture.write(STORE, RELEASED)

    const report = upgrade({ steps: [promote({ pending: () => false })] })

    // Not adopted, so the sync treats it as any untracked file that differs.
    expect(report.adopted).toEqual([])
    expect(fixture.read(STORE)).toBe(RELEASED)
    expect(report.incoming.map((entry: { reason: string }) => entry.reason)).toEqual(['untracked'])
  })

  it('leaves an ejected path ejected', () => {
    const lock = readLock(fixture.project)
    lock.ejected = [STORE]
    writeLock(fixture.project, lock)

    upgrade({ steps: [promote()] })
    expect(fixture.exists(STORE)).toBe(false)
  })
})

describe('reclassify', () => {
  const BARREL = 'src/modules/app/components/ui/index.ts'
  const released = [
    "export { default as UiButton } from './UiButton.vue'",
    '// app:ui-components-start',
    '// app:ui-components-end',
    '',
  ].join('\n')
  const generated = released.replace(
    '// app:ui-components-start\n',
    "// app:ui-components-start\nexport { default as UiTag } from './UiTag.vue'\n",
  )
  const upstream = released.replace(
    "UiButton.vue'\n",
    "UiButton.vue'\nexport { default as UiBadge } from './UiBadge.vue'\n",
  )

  /** A lock written before the barrel was merged: one whole-file hash. */
  function seedLegacy(contents: string) {
    fixture.write(BARREL, contents)
    const lock = emptyLock('1.1.0')
    lock.files[BARREL] = { class: 'managed', hash: hash(released), since: '1.0.0' }
    writeLock(fixture.project, lock)
  }

  function run(apply = true) {
    return runUpgrade({
      root: fixture.project,
      version: '1.2.0',
      flags: FLAGS,
      apply,
      source: writePayload(fixture.payload, { version: '1.2.0', merged: { [BARREL]: upstream } }),
      migrations: [
        migration('1.2.0', [
          {
            kind: 'reclassify',
            file: BARREL,
            pristine: [hashFor(BARREL, released, 'merged')],
          },
        ]),
      ],
    })
  }

  it('accepts a pristine blanked hash, so generated entries are not an edit', () => {
    seedLegacy(generated)

    const report = run()

    expect(report.adopted).toContainEqual({ rel: BARREL, class: 'merged', reason: 'reclassified' })
    expect(fixture.read(BARREL)).toContain("export { default as UiBadge } from './UiBadge.vue'")
    expect(fixture.read(BARREL)).toContain("export { default as UiTag } from './UiTag.vue'")
    expect(readLock(fixture.project).files[BARREL]).toMatchObject({
      class: 'merged',
      hash: hashFor(BARREL, upstream, 'merged'),
      since: '1.0.0',
    })
  })

  it('accepts the legacy whole-file hash once, and rewrites the record', () => {
    seedLegacy(released)
    run()
    expect(readLock(fixture.project).files[BARREL].class).toBe('merged')
  })

  it('leaves a file edited outside its app: regions for a person', () => {
    const edited = released.replace('UiButton', 'UiButtonRestyled')
    seedLegacy(edited)

    const report = run()

    expect(fixture.read(BARREL)).toBe(edited)
    expect(readLock(fixture.project).files[BARREL].class).toBe('managed')
    expect(report.incoming.map((entry: { rel: string }) => entry.rel)).toEqual([BARREL])
    expect(report.notes[0].text).toMatch(/outside its app: regions.*vuestrata adopt/s)
  })
})

describe('guarded codemods and notes', () => {
  const PACKAGE = 'package.json'
  const shipped =
    '{ "scripts": { "lint": "vp lint && node scripts/release/check-template-lock.mjs" } }\n'
  const removeGate = {
    file: PACKAGE,
    pending: (source: string) => source.includes('check-template-lock'),
    apply: (source: string) =>
      source.replace(' && node scripts/release/check-template-lock.mjs', ''),
    note: 'Remove check-template-lock.mjs from your lint script by hand.',
  }

  beforeEach(() => {
    writeLock(fixture.project, emptyLock('1.1.0'))
  })

  it('applies when the file is in the shape it knows', () => {
    fixture.write(PACKAGE, shipped)
    const report = upgrade({ files: {}, steps: [removeGate] })

    expect(fixture.read(PACKAGE)).toBe('{ "scripts": { "lint": "vp lint" } }\n')
    expect(report.migrations[0].changed).toEqual([PACKAGE])
    expect(report.notes).toEqual([])
  })

  it('leaves a file it does not recognise alone, with the note and a copy to compare', () => {
    const custom = '{ "scripts": { "lint": "check-template-lock.mjs --strict && vp lint" } }\n'
    fixture.write(PACKAGE, custom)

    const report = upgrade({
      files: {},
      steps: [{ ...removeGate, incoming: (source: string) => source.replace('--strict ', '') }],
    })

    expect(fixture.read(PACKAGE)).toBe(custom)
    expect(report.notes.map((note: { text: string }) => note.text)).toEqual([removeGate.note])
    expect(fixture.exists(`.vuestrata/incoming/${PACKAGE}`)).toBe(true)
  })

  it('skips a step that is no longer pending', () => {
    fixture.write(PACKAGE, '{ "scripts": { "lint": "vp lint" } }\n')
    const report = upgrade({ files: {}, steps: [removeGate] })
    expect(report.migrations[0].changed).toEqual([])
    expect(report.notes).toEqual([])
  })

  it('shows a note step, or with a file, only while it is pending', () => {
    fixture.write('Dockerfile', 'FROM nginx:1.25\n')

    const report = upgrade({
      files: {},
      steps: [
        { kind: 'note', note: 'Run `vpr security:headers`.' },
        {
          kind: 'note',
          file: 'Dockerfile',
          pending: (source: string) => source.includes('nginx:1.25'),
          note: 'Move the Dockerfile to nginx-unprivileged.',
        },
        {
          kind: 'note',
          file: 'Dockerfile',
          pending: (source: string) => source.includes('node:18'),
          note: 'Never shown.',
        },
      ],
    })

    expect(report.notes.map((note: { text: string }) => note.text)).toEqual([
      'Run `vpr security:headers`.',
      'Move the Dockerfile to nginx-unprivileged.',
    ])
  })
})

describe('which migrations run', () => {
  it('includes the release migration when the target is its prerelease', () => {
    expect(inMigrationRange('1.2.0', '1.1.0', '1.2.0-alpha.0')).toBe(true)
    expect(inMigrationRange('1.2.0', '1.1.0', '1.2.0')).toBe(true)
  })

  it('runs it again on the next prerelease, and not after the release', () => {
    expect(inMigrationRange('1.2.0', '1.2.0-alpha.0', '1.2.0-alpha.1')).toBe(true)
    expect(inMigrationRange('1.2.0', '1.2.0', '1.2.1-alpha.0')).toBe(false)
    expect(inMigrationRange('1.3.0', '1.2.0', '1.2.1')).toBe(false)
  })

  it('orders prerelease numbers as numbers', () => {
    expect(compareVersions('1.2.0-alpha.10', '1.2.0-alpha.9')).toBe(1)
    expect(compareVersions('1.2.0-alpha.1', '1.2.0-beta.0')).toBe(-1)
    expect(compareVersions('1.2.0-rc.1', '1.2.0')).toBe(-1)
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0)
  })

  it('selects oldest first and keeps several groups of one version in file order', () => {
    const selected = selectMigrations(
      [migration('1.3.0', []), migration('1.2.0', [], 'first'), migration('1.2.0', [], 'second')],
      '1.1.0',
      '1.3.0-alpha.2',
    )
    expect(selected.map((entry: { description: string }) => entry.description)).toEqual([
      'first',
      'second',
      'migrate to 1.3.0',
    ])
  })

  it('runs the 1.2.0 codemods on an upgrade to 1.2.0-alpha.0', () => {
    writeLock(fixture.project, emptyLock('1.1.0'))
    fixture.write('src/main.ts', 'old\n')

    const { report } = planUpgrade({
      root: fixture.project,
      version: '1.2.0-alpha.0',
      source: writePayload(fixture.payload, { version: '1.2.0-alpha.0' }),
      migrations: [migration('1.2.0', [{ file: 'src/main.ts', apply: () => 'new\n' }])],
    })

    expect(report.migrations.map((entry: { version: string }) => entry.version)).toEqual(['1.2.0'])
    expect(report.migrations[0].changed).toEqual(['src/main.ts'])
    // Planned, not written.
    expect(fixture.read('src/main.ts')).toBe('old\n')
  })
})

describe('validateMigration', () => {
  it.each([
    [{ kind: 'rename', file: 'x' }, /unknown kind/],
    [{ file: 'x' }, /no apply/],
    [{ kind: 'promote', file: 'x' }, /no pristine/],
    [{ kind: 'promote', pristine: [] }, /no file or slot/],
    [{ kind: 'note' }, /no note/],
    [{ kind: 'reclassify', file: 'x', to: 'seeded' }, /can only be merged/],
    // Demoting would let the sync replace a file that may hold app: entries.
    [{ kind: 'reclassify', file: 'x', to: 'managed' }, /can only be merged/],
  ])('rejects %o', (step, message) => {
    expect(() => validateMigration(migration('1.2.0', [step]))).toThrow(message)
  })

  it('accepts every migration this CLI ships', async () => {
    // loadAllMigrations validates each one as it loads.
    await expect(loadAllMigrations()).resolves.toBeInstanceOf(Array)
  })
})

describe('adopt', () => {
  const BARREL = 'src/modules/app/components/ui/index.ts'
  const barrel = (extra = '') =>
    [
      "export { default as UiButton } from './UiButton.vue'",
      extra,
      '// app:ui-components-start',
      "export { default as UiTag } from './UiTag.vue'",
      '// app:ui-components-end',
      '',
    ]
      .filter((line, index) => index !== 1 || line)
      .join('\n')

  function adopt(paths: string[], source?: unknown) {
    const lock = readLock(fixture.project)
    const result = adoptPaths({
      root: fixture.project,
      lock,
      manifest: loadManifest(fixture.project),
      source,
      version: '1.2.0',
      paths,
    })
    return { lock, ...result }
  }

  beforeEach(() => {
    writeLock(fixture.project, emptyLock('1.2.0'))
  })

  it('records a merged file by its blanked hash', () => {
    fixture.write(BARREL, barrel())
    const { lock, adopted, problems } = adopt([BARREL])

    expect(problems).toEqual([])
    expect(adopted).toEqual([{ rel: BARREL, class: 'merged' }])
    expect(lock.files[BARREL]).toMatchObject({
      class: 'merged',
      hash: hashFor(BARREL, barrel(), 'merged'),
    })
  })

  it('warns when what is adopted still differs from the release', () => {
    fixture.write(BARREL, barrel("export { default as UiLocal } from './UiLocal.vue'"))
    const source = writePayload(fixture.payload, {
      version: '1.2.0',
      merged: { [BARREL]: barrel() },
    })

    const { warnings } = adopt([BARREL], source)
    expect(warnings.join('\n')).toMatch(/still differs .* outside its app: regions/)
  })

  it('refuses a file Vuestrata does not ship', () => {
    fixture.write('src/modules/billing/index.ts', 'export {}\n')
    const { problems, lock } = adopt(['src/modules/billing/index.ts'])

    expect(problems[0]).toMatch(/not a file Vuestrata ships/)
    expect(lock.files['src/modules/billing/index.ts']).toBeUndefined()
  })

  it('never turns a seeded file back into a managed one', () => {
    const tag = 'src/modules/app/components/ui/UiTag.vue'
    fixture.write(tag, '<template><span /></template>\n')
    const lock = readLock(fixture.project)
    lock.files[tag] = { class: 'seeded', hash: hash('x'), since: '1.1.0' }
    writeLock(fixture.project, lock)

    const result = adopt([tag])
    expect(result.lock.files[tag].class).toBe('seeded')
  })

  it("re-records a registry's vuestrata: region, so region sync appends again", () => {
    const THEMES = 'src/modules/app/config/theme.config.ts'
    fixture.write(THEMES, "// vuestrata:themes-start\n{ name: 'pro' },\n// vuestrata:themes-end\n")

    const { lock, adopted } = adopt([THEMES])
    expect(adopted).toEqual([{ rel: THEMES, class: 'registry', region: 'vuestrata:themes' }])
    expect(lock.regions[THEMES]['vuestrata:themes']).toBeDefined()
  })
})
