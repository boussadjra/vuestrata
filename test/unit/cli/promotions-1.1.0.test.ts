import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  ADAPTER_UNIT_FILES,
  APP_SHELL,
  MAIN_SHELL,
  mainShellFor,
  // @ts-expect-error - the CLI is plain ESM JavaScript with no type declarations.
} from '../../../packages/cli/migrations/1.1.0/promotions.mjs'
// @ts-expect-error - see above.
import { runUpgrade } from '../../../packages/cli/src/commands/upgrade.mjs'
// @ts-expect-error - see above.
import { emptyLock, hashFor, readLock, writeLock } from '../../../packages/cli/src/lib/lockfile.mjs'
// @ts-expect-error - see above.
import { classify } from '../../../packages/cli/src/lib/managed.mjs'
// @ts-expect-error - see above.
import { collectMigrationsAsync } from '../../../packages/cli/src/lib/migrations.mjs'
// @ts-expect-error - see above.
import { createWorkspace } from '../../../packages/cli/src/lib/workspace.mjs'
import { MAINTAINER } from './cli'
import { createFixture, type Fixture, writePayload } from './fixture'

/**
 * The 1.1.0 promotions, against what the releases really shipped.
 *
 * A promote step adopts a file only when its hash is one a release produced,
 * and the codemods replace an entry file only on the same condition, so the
 * hashes and the shell texts are what a wrong migration would get wrong.
 * They are checked against the release tags themselves; a checkout without the
 * tags cannot, and skips those. Except in the template's own CI, where a
 * skipped proof is a proof that did not run: there the missing tags fail.
 */

// Vitest runs from the repository root, as every script here does.
const REPO = process.cwd()

// Each upgrade writes a project to disk and runs the whole migration list, and
// the tag checks start a git process per file: slow next to the default 5 s
// while the rest of the suite is running.
vi.setConfig({ testTimeout: 60_000 })
const TAGS = ['v1.0.1-alpha.5', 'v1.0.1-alpha.6']

function git(...args: string[]) {
  return spawnSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

const hasTags = TAGS.every(
  (tag) => git('rev-parse', '--verify', '--quiet', `${tag}^{commit}`).status === 0,
)

// A project built from the template has no upstream tags and never will, so
// only the template's CI (VUESTRATA_MAINTAINER=1) is held to having them.
const TAGS_REQUIRED = MAINTAINER && Boolean(process.env.CI)

const shown = new Map<string, string | null>()

/** A file as a release shipped it. Cached: each lookup is a `git show` process. */
function atTag(tag: string, rel: string): string | null {
  const key = `${tag}:${rel}`
  if (!shown.has(key)) {
    const result = git('show', key)
    shown.set(key, result.status === 0 ? result.stdout : null)
  }
  return shown.get(key) ?? null
}

const inRepo = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8')
const lf = (text: string) => text.replaceAll('\r\n', '\n')

const FLAGS = { 'allow-dirty': true, 'no-format': true }

/** The project on disk, as the workspace a migration step reads. */
const workspaceOf = (fixture: Fixture) => createWorkspace(fixture.project)
const FROM = '1.0.1-alpha.6'
const TAG = `v${FROM}`

async function promotions() {
  const found = await collectMigrationsAsync(FROM, '1.1.0-alpha.0')
  return found.filter(
    (migration: { description: string }) => !/gen: sentinel/.test(migration.description),
  )
}

interface Step {
  kind?: string
  file?: string
  pristine?: string[]
  unit?: string
}

describe('the release tags', () => {
  it.runIf(TAGS_REQUIRED)('are in the checkout, so the proofs against them run', () => {
    expect(
      hasTags,
      `${TAGS.join(' and ')} are not in this checkout, so every proof against them was skipped. ` +
        'Check out with full history and tags (actions/checkout `fetch-depth: 0`).',
    ).toBe(true)
  })
})

describe('the promotion data', () => {
  // Maintainers only: both files are the project's, and the first thing the
  // shell tells a project to do is edit it (`boot(App, { beforeMount })`). There
  // this would fail `vpr test --run` for following the instructions.
  it.runIf(MAINTAINER)(
    'preserves the 1.1 entrypoint shells before the 2.0 QueryWeave installer',
    () => {
      expect(lf(MAIN_SHELL)).toBe(lf(inRepo('test/fixtures/cli/table-1.1/main.ts.txt')))
      expect(lf(APP_SHELL)).toBe(lf(inRepo('test/fixtures/cli/table-1.1/App.vue.txt')))
    },
  )

  it('promotes only files this release manages, each of which exists', async () => {
    const steps: Step[] = (await promotions()).flatMap((migration: { steps: Step[] }) =>
      migration.steps.filter((step) => step.kind === 'promote'),
    )

    expect(steps.length).toBeGreaterThan(25)
    for (const step of steps) {
      expect(classify(step.file), `${step.file} is not managed`).toBe('managed')
      expect(fs.existsSync(path.join(REPO, step.file!)), `${step.file} is missing`).toBe(true)
    }
  })

  it('keeps the two headers scripts in one unit, and three adapter files in another', async () => {
    const steps: Step[] = (await promotions()).flatMap((migration: { steps: Step[] }) =>
      migration.steps.filter((step) => step.kind === 'promote' && step.unit),
    )
    const unitOf = (file: string) => steps.find((step) => step.file === file)?.unit

    expect(steps.map((step) => step.file)).toEqual([
      'src/modules/auth/adapters/base.ts',
      'src/modules/auth/adapters/jwt.ts',
      'src/modules/auth/adapters/types.ts',
      'scripts/security/headers.mjs',
      'scripts/security/sync-headers.mjs',
    ])
    expect(new Set(steps.map((step) => step.unit)).size).toBe(2)
    expect(unitOf('scripts/security/headers.mjs')).toBe(unitOf('scripts/security/sync-headers.mjs'))
    expect(unitOf('src/modules/auth/adapters/base.ts')).toBe(
      unitOf('src/modules/auth/adapters/jwt.ts'),
    )
    expect(unitOf('src/modules/auth/adapters/base.ts')).toBe(
      unitOf('src/modules/auth/adapters/types.ts'),
    )
    // What a unit shares, a held-back member must still explain: each step
    // carries the note, because the one that speaks is the first the project has.
    expect(ADAPTER_UNIT_FILES).toEqual(steps.slice(0, 3).map((step) => step.file))
  })

  it.skipIf(!hasTags)(
    'lists, for every promoted file, exactly the hashes the tags produced',
    async () => {
      const steps: Step[] = (await promotions()).flatMap((migration: { steps: Step[] }) =>
        migration.steps.filter((step) => step.kind === 'promote'),
      )

      for (const step of steps) {
        const produced = new Set(
          TAGS.map((tag) => atTag(tag, step.file!)).map((contents) =>
            contents === null ? null : hashFor(step.file, contents, 'managed'),
          ),
        )
        expect(produced.has(null), `${step.file} is missing at a tag`).toBe(false)
        const byValue = (a: string | null, b: string | null) => String(a).localeCompare(String(b))
        expect([...produced].sort(byValue), step.file).toEqual([...step.pristine!].sort(byValue))
      }
    },
  )
})

describe.skipIf(!hasTags)('upgrading a project from 1.0.1-alpha.6', () => {
  const STORE = 'src/modules/app/stores/auth.ts'
  const ADAPTERS = 'src/modules/auth/adapters/index.ts'
  const QUERY = 'src/modules/app/plugins/vue-query.ts'
  const BACKENDS = 'src/modules/app/state/runtime-backends.ts'
  const LOCALE = 'src/modules/app/locales/en.json'
  const HEADERS = 'scripts/security/headers.mjs'
  const SYNC = 'scripts/security/sync-headers.mjs'
  const MAIN = 'src/main.ts'
  const APP = 'src/App.vue'
  const VITE = 'vite.config.ts'

  const PROMOTED = [STORE, ADAPTERS, QUERY, BACKENDS, LOCALE, HEADERS, SYNC]

  let fixture: Fixture

  beforeEach(() => {
    fixture = createFixture()
  })

  afterEach(() => {
    fixture.cleanup()
  })

  /** A project exactly as 1.0.1-alpha.6 shipped it, for the files this touches. */
  function seedProject() {
    for (const rel of [...PROMOTED, MAIN, APP, VITE]) fixture.write(rel, atTag(TAG, rel)!)
    writeLock(fixture.project, emptyLock(FROM))
  }

  async function upgrade(version = '1.1.0-alpha.0') {
    return runUpgrade({
      root: fixture.project,
      version,
      flags: FLAGS,
      apply: true,
      // What this tree ships for each promoted file: the release the project is moving to.
      source: writePayload(fixture.payload, {
        version,
        files: Object.fromEntries(PROMOTED.map((rel) => [rel, inRepo(rel)])),
      }),
      migrations: await collectMigrationsAsync(FROM, version),
    })
  }

  const notesFor = (report: { notes: Array<{ rel?: string; text: string }> }, rel: string) =>
    report.notes.filter((note) => note.rel === rel)

  /** The standing reminder that follows a replaced pair of header scripts. */
  const REMINDER = /were replaced .*run `vpr security:headers`/s

  it('adopts every pristine promoted file and brings it up to date', async () => {
    seedProject()

    const report = await upgrade()

    // The one reminder that follows a replaced generator pair.
    expect(notesFor(report, HEADERS).map((note) => note.text)).toEqual([
      expect.stringMatching(REMINDER),
    ])

    const adopted = report.adopted.map((entry: { rel: string }) => entry.rel)
    for (const rel of PROMOTED) expect(adopted, rel).toContain(rel)
    for (const rel of PROMOTED) {
      expect(fixture.read(rel), rel).toBe(inRepo(rel))
      expect(readLock(fixture.project).files[rel], rel).toMatchObject({ class: 'managed' })
    }
    expect(report.incoming).toEqual([])
  })

  it('replaces a pristine main.ts and App.vue with the shells', async () => {
    seedProject()

    await upgrade()

    expect(fixture.read(MAIN)).toBe(MAIN_SHELL)
    expect(fixture.read(APP)).toBe(APP_SHELL)
  })

  it('writes the shell in the line endings the file had', async () => {
    seedProject()
    fixture.write(MAIN, atTag(TAG, MAIN)!.replaceAll('\n', '\r\n'))

    await upgrade()

    expect(fixture.read(MAIN)).toBe(MAIN_SHELL.replaceAll('\n', '\r\n'))
  })

  it('leaves an edited main.ts alone, with the new one beside it and a note', async () => {
    seedProject()
    const edited = `${atTag(TAG, MAIN)!}\napp.use(MyOwnPlugin)\n`
    fixture.write(MAIN, edited)

    const report = await upgrade()

    expect(fixture.read(MAIN)).toBe(edited)
    expect(fixture.read(`.vuestrata/incoming/${MAIN}`)).toBe(MAIN_SHELL)
    expect(notesFor(report, MAIN)).toHaveLength(1)
    expect(notesFor(report, MAIN)[0]?.text).toMatch(/beforeMount/)
    // App.vue is judged on its own: an edited main.ts does not hold it back.
    expect(fixture.read(APP)).toBe(APP_SHELL)
  })

  it('leaves an edited App.vue alone, with the new one beside it and a note', async () => {
    seedProject()
    const edited = atTag(TAG, APP)!.replace('common_error_generic', 'my_own_error')
    fixture.write(APP, edited)

    const report = await upgrade()

    expect(fixture.read(APP)).toBe(edited)
    expect(fixture.read(`.vuestrata/incoming/${APP}`)).toBe(APP_SHELL)
    expect(notesFor(report, APP)).toHaveLength(1)
    expect(fixture.read(MAIN)).toBe(MAIN_SHELL)
  })

  it('imports the Vite plugin while keeping optional query optimization project-owned', async () => {
    seedProject()

    await upgrade()

    const required = lf(inRepo('test/fixtures/cli/table-1.1/vite.config.ts.txt')).replace(
      /\n      treeshake: \{[\s\S]*?\n      \},(?=\n      output:)/,
      '',
    )
    expect(lf(fixture.read(VITE))).toBe(required)
  })

  it('leaves a vite.config.ts whose inline plugin was edited, with a note', async () => {
    seedProject()
    const edited = atTag(TAG, VITE)!.replace("'VUESTRATA_'", "'VUESTRATA_', 'ACME_'")
    fixture.write(VITE, edited)

    const report = await upgrade()

    // Everything down to the config object is as the project left it: the
    // imports and the inline plugin. The ignore lists and the test block below
    // are other steps', and nobody edited them here, so they do get this
    // release's entries (migration-1.1.0.test.ts).
    const upTo = (text: string) => text.slice(0, text.indexOf('export default defineConfig('))
    const result = fixture.read(VITE)
    expect(upTo(edited)).toContain("'VUESTRATA_', 'ACME_'")
    expect(upTo(result)).toBe(upTo(edited))
    expect(result).not.toContain("from './scripts/vite/vuestrata-plugin.mjs'")
    expect(notesFor(report, VITE)).toHaveLength(1)
    expect(notesFor(report, VITE)[0]?.text).toMatch(/scripts\/vite\/vuestrata-plugin\.mjs/)
  })

  it('keeps everything else in an edited vite.config.ts, and only swaps the plugin', async () => {
    seedProject()
    const edited = atTag(TAG, VITE)!.replace("'no-console': 'warn'", "'no-console': 'error'")
    fixture.write(VITE, edited)

    await upgrade()

    const result = fixture.read(VITE)
    expect(result).toContain("'no-console': 'error'")
    expect(result).toContain("from './scripts/vite/vuestrata-plugin.mjs'")
    expect(result).not.toContain('function vuestrataEnv')
    expect(result).not.toContain('parseRuntimeEnv')
  })

  it('holds back both header scripts when either is edited, and says so once', async () => {
    seedProject()
    const edited = `${atTag(TAG, HEADERS)!}\n// our CSP\n`
    fixture.write(HEADERS, edited)

    const report = await upgrade()

    expect(fixture.read(HEADERS)).toBe(edited)
    expect(fixture.read(SYNC)).toBe(atTag(TAG, SYNC))
    expect(fixture.read(`.vuestrata/incoming/${HEADERS}`)).toBe(inRepo(HEADERS))
    expect(fixture.read(`.vuestrata/incoming/${SYNC}`)).toBe(inRepo(SYNC))
    expect(readLock(fixture.project).files[HEADERS]).toBeUndefined()
    expect(readLock(fixture.project).files[SYNC]).toBeUndefined()
    // One note for the unit, and nothing else: the reminder to regenerate the
    // outputs is for a pair that was replaced, and this one was not.
    const texts = notesFor(report, HEADERS).map((note) => note.text)
    expect(texts).toHaveLength(1)
    expect(texts[0]).toMatch(/one unit/)
    expect(texts[0]).not.toMatch(REMINDER)
    expect(notesFor(report, SYNC)).toHaveLength(0)
  })

  it('does not ask for the outputs to be regenerated when only sync-headers.mjs is edited', async () => {
    seedProject()
    const edited = `${atTag(TAG, SYNC)!}\n// our extra target\n`
    fixture.write(SYNC, edited)

    const report = await upgrade()

    // headers.mjs is the file the reminder hangs on, and it is a release's copy;
    // the pair is still held back, so there is nothing new to regenerate from.
    expect(fixture.read(HEADERS)).toBe(atTag(TAG, HEADERS))
    expect(fixture.read(SYNC)).toBe(edited)
    const texts = report.notes.map((note: { text: string }) => note.text)
    expect(texts.filter((text: string) => /one unit/.test(text))).toHaveLength(1)
    expect(texts.join('\n')).not.toMatch(REMINDER)
  })

  it('does nothing the second time', async () => {
    seedProject()
    await upgrade('1.1.0-alpha.0')

    const before = Object.fromEntries(
      [...PROMOTED, MAIN, APP, VITE].map((rel) => [rel, fixture.read(rel)]),
    )
    const again = await upgrade('1.1.0-alpha.1')

    expect(again.adopted).toEqual([])
    expect(again.written).toEqual([])
    expect(again.incoming).toEqual([])
    expect(again.notes).toEqual([])
    expect(again.migrations.flatMap((entry: { changed: string[] }) => entry.changed)).toEqual([])
    for (const [rel, contents] of Object.entries(before))
      expect(fixture.read(rel), rel).toBe(contents)
  })

  it('tells an edited store from a stale one: only a release hash is adopted', async () => {
    seedProject()
    const edited = `${atTag(TAG, STORE)!}\n// project tweak\n`
    fixture.write(STORE, edited)

    const report = await upgrade()

    expect(fixture.read(STORE)).toBe(edited)
    expect(readLock(fixture.project).files[STORE]).toBeUndefined()
    expect(fixture.read(`.vuestrata/incoming/${STORE}`)).toBe(inRepo(STORE))
    expect(notesFor(report, STORE)[0]?.text).toMatch(/vuestrata adopt/)
  })

  it('says what a held-back store costs the files around it', async () => {
    seedProject()
    fixture.write(STORE, `${atTag(TAG, STORE)!}\n// project tweak\n`)

    const report = await upgrade()

    const text = notesFor(report, STORE)[0]?.text
    // The effects are not in the store: they are in what waits for its event.
    expect(text).toContain('`auth.logout`')
    expect(text).toContain('does not clear the query cache')
    expect(text).toContain('refresh-cookie')
    expect(text).toContain('`userPermissions` is still []')
    expect(text).toContain(`vuestrata adopt ${STORE}`)
  })

  describe('the auth adapters', () => {
    const BASE = 'src/modules/auth/adapters/base.ts'
    const JWT = 'src/modules/auth/adapters/jwt.ts'
    const TYPES = 'src/modules/auth/adapters/types.ts'
    const UNIT = [BASE, JWT, TYPES]
    const OTHERS = [
      'src/modules/auth/adapters/mock.ts',
      'src/modules/auth/adapters/oauth.ts',
      'src/modules/auth/adapters/pkce-state.ts',
    ]
    const ALL = [...UNIT, ADAPTERS, ...OTHERS]

    function seedAdapters() {
      for (const rel of ALL) fixture.write(rel, atTag(TAG, rel)!)
      writeLock(fixture.project, emptyLock(FROM))
    }

    async function upgradeAdapters(version = '1.1.0-alpha.0') {
      return runUpgrade({
        root: fixture.project,
        version,
        flags: FLAGS,
        apply: true,
        source: writePayload(fixture.payload, {
          version,
          files: Object.fromEntries(ALL.map((rel) => [rel, inRepo(rel)])),
        }),
        migrations: await collectMigrationsAsync(FROM, version),
      })
    }

    const incoming = (rel: string) => `.vuestrata/incoming/${rel}`

    it('replaces all of them when none was edited', async () => {
      seedAdapters()

      const report = await upgradeAdapters()

      for (const rel of ALL) expect(lf(fixture.read(rel)), rel).toBe(lf(inRepo(rel)))
      expect(report.incoming).toEqual([])
      // The only note is the one about the backend, which a replaced unit prints.
      expect(report.notes.map((note: { rel?: string }) => note.rel)).toEqual([JWT])
    })

    // The case the unit exists for. base.ts holds the endpoint paths, so it is
    // the file a project edits; jwt.ts it leaves alone. Replacing jwt.ts by
    // itself would leave it calling endpoints the kept base.ts does not have.
    it('holds jwt.ts and types.ts back with an edited base.ts, in one note that names the unit', async () => {
      seedAdapters()
      const edited = atTag(TAG, BASE)!.replace("'/auth/login'", "'/v2/auth/login'")
      expect(edited).not.toBe(atTag(TAG, BASE))
      fixture.write(BASE, edited)

      const report = await upgradeAdapters()

      expect(fixture.read(BASE)).toBe(edited)
      // Unedited, and still not replaced.
      expect(fixture.read(JWT)).toBe(atTag(TAG, JWT))
      expect(fixture.read(TYPES)).toBe(atTag(TAG, TYPES))
      for (const rel of UNIT) {
        expect(lf(fixture.read(incoming(rel))), rel).toBe(lf(inRepo(rel)))
        expect(readLock(fixture.project).files[rel], rel).toBeUndefined()
      }

      const notes = report.notes.filter((note: { rel?: string }) => UNIT.includes(note.rel ?? ''))
      expect(notes).toHaveLength(1)
      expect(notes[0].rel).toBe(BASE)
      for (const rel of UNIT) expect(notes[0].text).toContain(rel)
      expect(notes[0].text).toContain('are one unit')
      expect(notes[0].text).toContain('`vuestrata adopt` on all three')
      // What merging it changes for the backend, since the CORS note itself is
      // only printed for a unit that was replaced.
      expect(notes[0].text).toContain('Access-Control-Allow-Credentials: true')
      expect(notes[0].text).toContain('UPGRADING.md')

      // The rest of the directory does not wait for the unit.
      for (const rel of [ADAPTERS, ...OTHERS]) {
        expect(lf(fixture.read(rel)), rel).toBe(lf(inRepo(rel)))
        expect(fixture.exists(incoming(rel)), rel).toBe(false)
      }
    })

    it.each([
      ['jwt.ts', JWT],
      ['types.ts', TYPES],
    ])('holds the unit back for an edited %s too', async (_name, rel) => {
      seedAdapters()
      fixture.write(rel, `${atTag(TAG, rel)!}\n// ours\n`)

      const report = await upgradeAdapters()

      for (const member of UNIT.filter((file) => file !== rel)) {
        expect(fixture.read(member), member).toBe(atTag(TAG, member))
      }
      expect(
        report.notes.filter((note: { text: string }) => /are one unit/.test(note.text)),
      ).toHaveLength(1)
    })

    it('keeps an edited index.ts by itself: registering an adapter costs none of the fixes', async () => {
      seedAdapters()
      const edited = `${atTag(TAG, ADAPTERS)!}\n// our own adapter is registered above\n`
      fixture.write(ADAPTERS, edited)

      const report = await upgradeAdapters()

      expect(fixture.read(ADAPTERS)).toBe(edited)
      expect(lf(fixture.read(incoming(ADAPTERS)))).toBe(lf(inRepo(ADAPTERS)))
      for (const rel of [...UNIT, ...OTHERS]) {
        expect(lf(fixture.read(rel)), rel).toBe(lf(inRepo(rel)))
      }
      expect(
        report.notes.filter((note: { text: string }) => /are one unit/.test(note.text)),
      ).toEqual([])
    })

    it('takes the unit over on the upgrade after the project merged the incoming files', async () => {
      seedAdapters()
      fixture.write(BASE, `${atTag(TAG, BASE)!}\n// ours\n`)
      await upgradeAdapters()

      // Merged by hand: all three are now this release's files.
      for (const rel of UNIT) fixture.write(rel, fixture.read(incoming(rel)))
      const again = await upgradeAdapters('1.1.0-alpha.1')

      const adopted = again.adopted.map((entry: { rel: string }) => entry.rel)
      for (const rel of UNIT) {
        expect(adopted, rel).toContain(rel)
        expect(readLock(fixture.project).files[rel], rel).toMatchObject({ class: 'managed' })
      }
      expect(
        again.notes.filter((note: { text: string }) => /are one unit/.test(note.text)),
      ).toEqual([])
    })
  })

  it('points an edited catalog at the overrides file', async () => {
    seedProject()
    fixture.write(LOCALE, `${atTag(TAG, LOCALE)!.trimEnd().slice(0, -1)}, "mine": "x" }\n`)

    const report = await upgrade()

    expect(notesFor(report, LOCALE)[0]?.text).toMatch(/en\.overrides\.json/)
  })

  it('points an edited query plugin at the boot option', async () => {
    seedProject()
    fixture.write(QUERY, `${atTag(TAG, QUERY)!}\n// mine\n`)

    const report = await upgrade()

    expect(notesFor(report, QUERY)[0]?.text).toMatch(/queryOptions/)
  })

  describe('with query options of its own in plugins/vue-query.ts', () => {
    /** The project raised the stale time, in the file the old main.ts read. */
    function tuneQueries() {
      const tuned = atTag(TAG, QUERY)!.replace('staleTime: 30_000', 'staleTime: 60_000')
      expect(tuned).not.toBe(atTag(TAG, QUERY))
      fixture.write(QUERY, tuned)
      return tuned
    }

    it('hands them to boot() from the main.ts it writes, rather than dropping them', async () => {
      seedProject()
      const tuned = tuneQueries()

      const report = await upgrade()

      // The plugin is an edit, so it stays, and the new main.ts still reads it.
      expect(fixture.read(QUERY)).toBe(tuned)
      const main = fixture.read(MAIN)
      expect(main).toBe(mainShellFor(workspaceOf(fixture)))
      expect(main).toContain("import { vueQueryOptions } from '@/plugins/vue-query'")
      expect(main).toContain('void boot(App, { queryOptions: vueQueryOptions })')
      expect(main).not.toContain('void boot(App)')

      expect(notesFor(report, MAIN)).toHaveLength(0)
      const note = notesFor(report, QUERY)[0]?.text
      expect(note).toMatch(/passes your `vueQueryOptions` to boot\(\)/)
      expect(note).toMatch(/Adopting it first would drop your options/)
      // The tuned file still holds 1.0's `retry: 1`, over a client that no
      // longer retries: the note gives the three settings to change.
      expect(tuned).toContain('retry: 1')
      expect(note).toMatch(/retry: shouldRetryQuery/)
      expect(note).toMatch(/retryDelay: queryRetryDelay/)
      expect(note).toMatch(/retry: false/)
    })

    it('differs from the plain shell only by the import and the option', async () => {
      seedProject()
      tuneQueries()

      await upgrade()

      const plain = MAIN_SHELL.split('\n')
      const added = fixture
        .read(MAIN)
        .split('\n')
        .filter((line) => !plain.includes(line) && !line.startsWith('//'))
      expect(added).toEqual([
        "import { vueQueryOptions } from '@/plugins/vue-query'",
        'void boot(App, { queryOptions: vueQueryOptions })',
      ])
    })

    it('offers an edited main.ts the same shell, options included', async () => {
      seedProject()
      tuneQueries()
      const edited = `${atTag(TAG, MAIN)!}\napp.use(MyOwnPlugin)\n`
      fixture.write(MAIN, edited)

      await upgrade()

      expect(fixture.read(MAIN)).toBe(edited)
      expect(fixture.read(`.vuestrata/incoming/${MAIN}`)).toContain(
        'void boot(App, { queryOptions: vueQueryOptions })',
      )
    })

    it('leaves that main.ts alone on the next prerelease', async () => {
      seedProject()
      tuneQueries()
      await upgrade('1.1.0-alpha.0')
      const main = fixture.read(MAIN)

      const again = await upgrade('1.1.0-alpha.1')

      expect(fixture.read(MAIN)).toBe(main)
      expect(notesFor(again, MAIN)).toHaveLength(0)
    })
  })

  it('names the two lines an edited runtime-backends.ts needs to install rbac.overrides.ts', async () => {
    seedProject()
    const edited = `${atTag(TAG, BACKENDS)!}\n// ours\n`
    fixture.write(BACKENDS, edited)

    const report = await upgrade()

    expect(fixture.read(BACKENDS)).toBe(edited)
    expect(fixture.read(`.vuestrata/incoming/${BACKENDS}`)).toBe(inRepo(BACKENDS))
    const text = notesFor(report, BACKENDS)[0]?.text
    expect(text).toContain('const rbacConfig = resolveRbacOverrides(rbacOverrides)')
    expect(text).toContain('installRbacConfig(rbacConfig)')
    expect(text).toContain(`vuestrata adopt ${BACKENDS}`)
  })
})
