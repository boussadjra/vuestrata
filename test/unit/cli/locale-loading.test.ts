import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vite-plus/test'

import { loadCli, MAINTAINER } from './cli'
import { createFixture, type Fixture } from './fixture'

const {
  default: migration,
  LOCALE_FILES,
  localeTarget,
} = await loadCli('migrations/1.1.0/locale-loading.mjs')
const { applyMigrations } = await loadCli('src/lib/migrations.mjs')
const { createWorkspace } = await loadCli('src/lib/workspace.mjs')
const { emptyLock } = await loadCli('src/lib/lockfile.mjs')
const { loadManifest } = await loadCli('src/lib/manifest.mjs')
const CATALOG = 'src/modules/app/state/locale-catalogs.ts'
const ROOT = process.cwd()
let fixture: Fixture

afterEach(() => fixture?.cleanup())

function run(manifest = loadManifest(fixture.project)) {
  const ws = createWorkspace(fixture.project)
  const result = applyMigrations({
    migrations: [{ ...migration, version: '1.1.0' }],
    ws,
    lock: emptyLock('1.0.1-alpha.6'),
    manifest,
    source: {
      has: (file: string) => file === CATALOG,
      read: () => fs.readFileSync(path.join(ROOT, CATALOG), 'utf8'),
    },
    version: '1.1.0',
  })
  ws.flush()
  return result
}

function seed(eol = '\n') {
  fixture = createFixture()
  for (const file of LOCALE_FILES as string[]) {
    // This commit is the integrated 1.1.0 baseline before lazy catalogs.
    const original = execFileSync('git', ['show', `819031f:${file}`], { encoding: 'utf8' })
    fixture.write(file, original.replaceAll('\r\n', '\n').replaceAll('\n', eol))
  }
}

describe.skipIf(!MAINTAINER)('the language-loading upgrade', () => {
  it('updates the five dependent files together and is idempotent', () => {
    seed()
    const result = run()
    expect(result.notes).toEqual([])
    expect(result.applied[0].changed).toEqual(LOCALE_FILES)
    for (const file of LOCALE_FILES as string[]) {
      expect(fixture.read(file).replaceAll('\r\n', '\n')).toBe(
        fs.readFileSync(path.join(ROOT, file), 'utf8').replaceAll('\r\n', '\n'),
      )
    }
    expect(run().applied[0].changed).toEqual([])
  })

  it('keeps all five files when one has project edits and offers all incoming copies', () => {
    seed()
    const file = LOCALE_FILES[2]
    fixture.write(file, `${fixture.read(file)}\n// Project-specific selection behavior\n`)
    const before = new Map((LOCALE_FILES as string[]).map((rel) => [rel, fixture.read(rel)]))
    const result = run()
    expect(result.notes).toHaveLength(1)
    expect(result.incoming.map(({ rel }: { rel: string }) => rel)).toEqual(LOCALE_FILES)
    for (const rel of LOCALE_FILES as string[]) expect(fixture.read(rel)).toBe(before.get(rel))
  })

  it('preserves Windows line endings', () => {
    seed('\r\n')
    run()
    for (const file of LOCALE_FILES as string[]) expect(fixture.read(file)).not.toMatch(/[^\r]\n/)
  })

  it('keeps the group when the managed coordinator has project edits', () => {
    seed()
    fixture.write(CATALOG, 'export const custom = true\n')
    const result = run()
    expect(result.applied[0].changed).toEqual([])
    expect(result.incoming).toHaveLength(5)
    expect(fixture.read(CATALOG)).toBe('export const custom = true\n')
  })

  it('follows relocated app and module slots', () => {
    seed()
    const manifest = loadManifest(fixture.project)
    manifest.slots.appDir = 'src/application'
    manifest.slots.modulesDir = 'src/features'
    for (const file of LOCALE_FILES as string[])
      fixture.write(localeTarget(file, manifest), fixture.read(file))
    const result = run(manifest)
    expect(result.applied[0].changed).toEqual(
      (LOCALE_FILES as string[]).map((file) => localeTarget(file, manifest)),
    )
    for (const file of LOCALE_FILES as string[])
      expect(fixture.read(localeTarget(file, manifest))).toBe(
        fs.readFileSync(path.join(ROOT, file), 'utf8').replaceAll('\r\n', '\n'),
      )
  })
})
