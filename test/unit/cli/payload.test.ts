import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { CLI_PRESENT, loadCli, MAINTAINER } from './cli'
import { createFixture, type Fixture, hash, writePayload } from './fixture'

// Loaded rather than imported, so a project without `packages/cli` skips this
// file instead of failing to collect it.
const buildScript = await loadCli('scripts/build-payload.mjs')
const { runUpgrade } = await loadCli('src/commands/upgrade.mjs')
const lockfile = await loadCli('src/lib/lockfile.mjs')
const managed = await loadCli('src/lib/managed.mjs')
const { createPayloadSource } = await loadCli('src/lib/payload.mjs')

const SCRIPT = path.resolve(process.cwd(), 'packages/cli/scripts/build-payload.mjs')

/**
 * The payload is the release: what an upgrade installs, and what it is told
 * each file is. Its index has had two shapes, and a CLI that could not read
 * the first would strand every payload built before the second.
 */

const { buildPayload, isEntryPoint, unsyncableLines } = buildScript
const { emptyLock, hashFor, readLock, writeLock } = lockfile
const { MERGED_FILES, SEEDED_FILES } = managed

const FLAGS = { 'allow-dirty': true, 'no-format': true }
const BARREL = 'src/modules/app/components/ui/index.ts'

let fixture: Fixture

beforeEach(() => {
  fixture = createFixture()
})

afterEach(() => {
  fixture.cleanup()
})

describe.skipIf(!CLI_PRESENT)('createPayloadSource', () => {
  it('reads a v1 index: every file managed, nothing seeded, merged or region-scoped', () => {
    const source = writePayload(
      fixture.payload,
      { version: '1.0.0', files: { 'src/ui/Button.vue': 'v1\n' } },
      { format: 1 },
    )

    expect(source.format).toBe(1)
    expect(source.version).toBe('1.0.0')
    expect(source.seeded).toEqual({})
    expect(source.merged).toEqual({})
    expect(source.regions).toEqual({})
    expect(source.classOf('src/ui/Button.vue')).toBe('managed')
    expect(source.read('src/ui/Button.vue')).toBe('v1\n')
    expect(source.hash('src/ui/Button.vue')).toBe(hash('v1\n'))
  })

  it('reads a v2 index, classes and regions included', () => {
    const source = writePayload(fixture.payload, {
      version: '1.1.0',
      files: { 'src/ui/Button.vue': 'v2\n' },
      merged: { [BARREL]: '// app:ui-components-start\n// app:ui-components-end\n' },
      seeded: { 'src/brand.css': ':root {}\n' },
      regions: { themeRegistry: { themes: ["{ name: 'pro' },"] } },
    })

    expect(source.format).toBe(2)
    expect(source.classOf('src/ui/Button.vue')).toBe('managed')
    expect(source.classOf(BARREL)).toBe('merged')
    expect(source.classOf('src/brand.css')).toBe('seeded')
    expect(source.classOf('src/elsewhere.ts')).toBeUndefined()
    expect(source.regions.themeRegistry.themes).toEqual(["{ name: 'pro' },"])

    // Seeded files ship beside the rest, so an upgrade can write a new seam.
    expect(source.has('src/brand.css')).toBe(true)
  })

  it('is undefined when the package was built without a payload', () => {
    expect(createPayloadSource(path.join(fixture.payload, 'missing'))).toBeUndefined()
  })
})

describe.skipIf(!CLI_PRESENT)('an upgrade from a v1 payload', () => {
  it("still installs managed files, and keeps a merged file's app: entries", () => {
    const upstream = [
      "export { default as UiButton } from './UiButton.vue'",
      "export { default as UiBadge } from './UiBadge.vue'",
      '// app:ui-components-start',
      '// app:ui-components-end',
      '',
    ].join('\n')
    const ours = [
      "export { default as UiButton } from './UiButton.vue'",
      '// app:ui-components-start',
      "export { default as UiTag } from './UiTag.vue'",
      '// app:ui-components-end',
      '',
    ].join('\n')

    fixture.write(BARREL, ours)
    fixture.write('src/ui/Button.vue', 'v1\n')
    const lock = emptyLock('1.0.0')
    lock.files[BARREL] = { class: 'merged', hash: hashFor(BARREL, ours, 'merged'), since: '1.0.0' }
    lock.files['src/ui/Button.vue'] = { class: 'managed', hash: hash('v1\n'), since: '1.0.0' }
    writeLock(fixture.project, lock)

    // A v1 index lists the barrel as a plain managed file. The lock knows
    // better, and the lock is what keeps the project's entries.
    const source = writePayload(
      fixture.payload,
      { version: '1.1.0', files: { [BARREL]: upstream, 'src/ui/Button.vue': 'v2\n' } },
      { format: 1 },
    )

    runUpgrade({
      root: fixture.project,
      version: '1.1.0',
      flags: FLAGS,
      apply: true,
      source,
      migrations: [],
    })

    expect(fixture.read('src/ui/Button.vue')).toBe('v2\n')
    expect(fixture.read(BARREL)).toContain("export { default as UiBadge } from './UiBadge.vue'")
    expect(fixture.read(BARREL)).toContain("export { default as UiTag } from './UiTag.vue'")
    expect(readLock(fixture.project).files[BARREL].class).toBe('merged')
  })
})

// Template maintainers only. These build the payload from THIS repository and
// expect the template as released; a project that has run `add module` no
// longer is one (its permissions sit in an app: region, which a payload refuses
// to ship). The build's own behaviour is covered by the suites around this one.
describe.skipIf(!CLI_PRESENT || !MAINTAINER)('build-payload', () => {
  // Built from this repository into a directory of its own: the same code
  // `prepack` runs, pointed somewhere a test may write.
  let out: string

  beforeEach(() => {
    out = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-payload-'))
  })

  afterEach(() => {
    fs.rmSync(out, { recursive: true, force: true })
  })

  it('writes a v2 index that classes every file the way the lists do', () => {
    const result = buildPayload({ repoRoot: process.cwd(), payloadRoot: out })
    expect(result.problems).toEqual([])
    expect(result.ok).toBe(true)

    const source = createPayloadSource(out)
    expect(source.format).toBe(2)

    // Merged files ship in `files` too, with their blanked hash alongside.
    for (const rel of MERGED_FILES as string[]) {
      const contents = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
      expect(source.classOf(rel)).toBe('merged')
      expect(source.files[rel]).toBe(hash(contents))
      expect(source.merged[rel]).toBe(hashFor(rel, contents, 'merged'))
    }

    for (const rel of SEEDED_FILES as string[]) {
      expect(source.classOf(rel)).toBe('seeded')
      expect(source.read(rel)).toBe(fs.readFileSync(path.join(process.cwd(), rel), 'utf8'))
    }
  })

  it("carries each project registry's vuestrata: region, and no merged file's", () => {
    buildPayload({ repoRoot: process.cwd(), payloadRoot: out })
    const { regions } = createPayloadSource(out)

    expect(Object.keys(regions).sort()).toEqual(
      [
        'envExample',
        'iconBarrel',
        'moduleRegistry',
        'navGroups',
        'styleEntry',
        'themeRegistry',
      ].sort(),
    )
    expect(regions.styleEntry['theme-imports']).toContain("@import './themes/pro.css';")
    expect(regions.themeRegistry.themes).toContain(
      "{ name: 'pro', label: 'Pro', cssClass: 'theme-pro' },",
    )
  })

  it('reports a stale payload in --check mode', () => {
    buildPayload({ repoRoot: process.cwd(), payloadRoot: out })
    expect(buildPayload({ repoRoot: process.cwd(), payloadRoot: out, check: true }).ok).toBe(true)

    const seam = path.join(out, 'files', SEEDED_FILES[0])
    fs.writeFileSync(seam, 'tampered\n')
    fs.writeFileSync(path.join(out, 'files', 'orphan.ts'), 'gone upstream\n')

    const result = buildPayload({ repoRoot: process.cwd(), payloadRoot: out, check: true })
    expect(result.ok).toBe(false)
    expect(result.stale).toContain(SEEDED_FILES[0])
    expect(result.stale).toContain('orphan.ts (no longer in the repository)')
  })
})

describe.skipIf(!CLI_PRESENT)('build-payload: what a region may ship', () => {
  const line = { keyedBy: 'line' }
  const variable = { keyedBy: 'variable' }
  const check = (lines: string[], registry = line) =>
    unsyncableLines('theme.config.ts', 'vuestrata:themes', lines, registry)

  it('accepts one whole entry per line', () => {
    expect(check(["{ name: 'pro', label: 'Pro' },", 'fooModule,'])).toEqual([])
  })

  it('refuses an entry the formatter wrapped, which would arrive in pieces', () => {
    const problems = check(['{', "  name: 'pro',", '},'])
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/"\{" in vuestrata:themes is not a whole entry/)
  })

  it('ignores brackets inside strings and comments', () => {
    expect(check(["'(' + name,", 'value, // }'])).toEqual([])
  })

  it('accepts documented variables, and refuses a comment that documents none', () => {
    expect(check(['# Where the API lives.', 'VUESTRATA_API_URL=/api'], variable)).toEqual([])

    const problems = check(['VUESTRATA_A=1', '', '# More arrive later.'], variable)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/documents no variable/)
  })
})

describe.skipIf(!CLI_PRESENT)('build-payload: running as a script', () => {
  let link: string

  afterEach(() => {
    if (link) fs.rmSync(link, { recursive: true, force: true })
  })

  it('recognises itself, and not another script', () => {
    expect(isEntryPoint(SCRIPT)).toBe(true)
    expect(isEntryPoint(path.resolve(process.cwd(), 'package.json'))).toBe(false)
    expect(isEntryPoint(undefined)).toBe(false)
  })

  it('recognises itself when run through a symlink or junction', () => {
    // Node loads the main module by its real path; argv[1] keeps the link's.
    // A plain comparison skipped main() and exited 0 having checked nothing.
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-link-'))
    link = base
    const scripts = path.join(base, 'scripts')
    fs.symlinkSync(path.dirname(SCRIPT), scripts, 'junction')

    expect(isEntryPoint(path.join(scripts, 'build-payload.mjs'))).toBe(true)
  })
})
