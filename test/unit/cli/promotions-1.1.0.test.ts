import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

// @ts-expect-error - see above.
import { APP_SHELL, MAIN_SHELL } from '../../../packages/cli/migrations/1.1.0/promotions.mjs'
// @ts-expect-error - the CLI is plain ESM JavaScript with no type declarations.
import { runUpgrade } from '../../../packages/cli/src/commands/upgrade.mjs'
// @ts-expect-error - see above.
import { emptyLock, hashFor, readLock, writeLock } from '../../../packages/cli/src/lib/lockfile.mjs'
// @ts-expect-error - see above.
import { classify } from '../../../packages/cli/src/lib/managed.mjs'
// @ts-expect-error - see above.
import { collectMigrationsAsync } from '../../../packages/cli/src/lib/migrations.mjs'
import { createFixture, type Fixture, writePayload } from './fixture'

/**
 * The 1.1.0 promotions, against what the releases really shipped.
 *
 * A promote step adopts a file only when its hash is one a release produced,
 * and the codemods replace an entry file only on the same condition, so the
 * hashes and the shell texts are what a wrong migration would get wrong.
 * They are checked against the release tags themselves; a checkout without the
 * tags cannot, and skips those.
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

describe('the promotion data', () => {
  it('ships src/main.ts and src/App.vue as the shells the codemods write', () => {
    expect(lf(MAIN_SHELL)).toBe(lf(inRepo('src/main.ts')))
    expect(lf(APP_SHELL)).toBe(lf(inRepo('src/App.vue')))
  })

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

  it('keeps the two headers scripts in one unit', async () => {
    const steps: Step[] = (await promotions()).flatMap((migration: { steps: Step[] }) =>
      migration.steps.filter((step) => step.kind === 'promote' && step.unit),
    )

    expect(steps.map((step) => step.file)).toEqual([
      'scripts/security/headers.mjs',
      'scripts/security/sync-headers.mjs',
    ])
    expect(new Set(steps.map((step) => step.unit)).size).toBe(1)
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
        expect([...produced].sort(), step.file).toEqual([...step.pristine!].sort())
      }
    },
  )
})

describe.skipIf(!hasTags)('upgrading a project from 1.0.1-alpha.6', () => {
  const STORE = 'src/modules/app/stores/auth.ts'
  const ADAPTERS = 'src/modules/auth/adapters/index.ts'
  const QUERY = 'src/modules/app/plugins/vue-query.ts'
  const LOCALE = 'src/modules/app/locales/en.json'
  const HEADERS = 'scripts/security/headers.mjs'
  const SYNC = 'scripts/security/sync-headers.mjs'
  const MAIN = 'src/main.ts'
  const APP = 'src/App.vue'
  const VITE = 'vite.config.ts'

  const PROMOTED = [STORE, ADAPTERS, QUERY, LOCALE, HEADERS, SYNC]

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

  it('adopts every pristine promoted file and brings it up to date', async () => {
    seedProject()

    const report = await upgrade()

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

  it('imports the Vite plugin in place of the inline one, to the byte', async () => {
    seedProject()

    await upgrade()

    // The T0-8 result: what a fresh clone's vite.config.ts is.
    expect(fixture.read(VITE)).toBe(inRepo(VITE))
  })

  it('leaves a vite.config.ts whose inline plugin was edited, with a note', async () => {
    seedProject()
    const edited = atTag(TAG, VITE)!.replace("'VUESTRATA_'", "'VUESTRATA_', 'ACME_'")
    fixture.write(VITE, edited)

    const report = await upgrade()

    expect(fixture.read(VITE)).toBe(edited)
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
    // One note for the unit, and the standing reminder to regenerate the outputs.
    const texts = notesFor(report, HEADERS).map((note) => note.text)
    expect(texts.filter((text) => /one unit/.test(text))).toHaveLength(1)
    expect(texts.filter((text) => /vpr security:headers/.test(text)).length).toBeGreaterThan(0)
    expect(notesFor(report, SYNC)).toHaveLength(0)
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
})
