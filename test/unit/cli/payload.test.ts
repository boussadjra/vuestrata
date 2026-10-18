import crypto from 'node:crypto'
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
const BRAND = 'src/modules/app/styles/brand.css'
const BRAND_ASSETS = 'src/modules/app/assets/fonts/brand'

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
    expect(source.assets).toEqual([])
    expect(source.classOf('src/ui/Button.vue')).toBe('managed')
    expect(source.read('src/ui/Button.vue')).toBe('v1\n')
    expect(source.hash('src/ui/Button.vue')).toBe(hash('v1\n'))
    expect(source.readBytes('src/ui/Button.vue')).toEqual(Buffer.from('v1\n'))
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
    expect(source.assets).toEqual([])
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

  it('upgrades a seeded text file from a provider without readBytes', () => {
    const contents = ':root { --brand: hotpink }\r\n'
    const source = writePayload(fixture.payload, {
      version: '1.1.0',
      seeded: { [BRAND]: contents },
    })
    expect(source.read(BRAND)).toBe(contents)
    expect(source.hash(BRAND)).toBe(hash(contents))
    writeLock(fixture.project, emptyLock('1.0.0'))

    runUpgrade({
      root: fixture.project,
      version: source.version,
      flags: FLAGS,
      apply: true,
      source: { ...source, readBytes: undefined },
      migrations: [],
    })

    expect(fixture.read(BRAND)).toBe(contents)
    expect(readLock(fixture.project).files[BRAND]).toEqual({ class: 'seeded', since: '1.1.0' })
  })

  it('refuses an asset provider without readBytes before changing the project', () => {
    const font = `${BRAND_ASSETS}/synthetic.woff2`
    const source = writePayload(fixture.payload, {
      version: '1.1.0',
      seeded: { [font]: 'A text reader cannot preserve arbitrary font bytes.' },
    })
    writeLock(fixture.project, emptyLock('1.0.0'))
    const initialLock = fixture.read('vuestrata.lock.json')

    expect(() =>
      runUpgrade({
        root: fixture.project,
        version: source.version,
        flags: FLAGS,
        apply: true,
        source: { ...source, assets: [font], readBytes: undefined },
        migrations: [],
      }),
    ).toThrow(`Payload asset ${font} requires a byte-preserving readBytes provider.`)

    expect(fixture.exists(font)).toBe(false)
    expect(fixture.read('vuestrata.lock.json')).toBe(initialLock)
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

  // Exercise the real brand's upgrade path without installing unrelated managed
  // files; those have their own upgrade suite and add hundreds of disk writes.
  const brandUpgradeSource = () => {
    const source = createPayloadSource(out)
    return {
      ...source,
      files: {},
      merged: {},
      regions: {},
      seeded: Object.fromEntries(
        Object.entries(source.seeded).filter(
          ([rel]) => rel === BRAND || source.assets.includes(rel),
        ),
      ),
    }
  }

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

  it('lists the docs pages it ships, so eject removes those and no other', () => {
    buildPayload({ repoRoot: process.cwd(), payloadRoot: out })
    const { docs, files } = createPayloadSource(out)

    expect(docs).toContain('docs/index.md')
    // A list for eject to read, not files an upgrade installs.
    expect(Object.keys(files).some((rel) => rel.startsWith('docs/'))).toBe(false)
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

  it('ships every local brand font and its licenses as byte-identical seeded companions', () => {
    const result = buildPayload({ repoRoot: process.cwd(), payloadRoot: out })
    expect(result.ok).toBe(true)
    const source = createPayloadSource(out)
    const assets = fs
      .readdirSync(path.join(process.cwd(), BRAND_ASSETS))
      .map((name) => `${BRAND_ASSETS}/${name}`)
      .sort()
    const fontReferences = [...source.read(BRAND).matchAll(/url\(['"]([^'"]+\.woff2)['"]\)/g)].map(
      ([, url]) => path.posix.normalize(path.posix.join(path.posix.dirname(BRAND), url!)),
    )

    expect(fontReferences).toHaveLength(10)
    expect(assets.filter((rel) => rel.endsWith('.woff2')).sort()).toEqual(
      [...fontReferences].sort(),
    )
    expect(assets).toEqual(
      expect.arrayContaining(
        [
          'OFL-Newsreader.txt',
          'OFL-Noto-Naskh-Arabic.txt',
          'OFL-Plus-Jakarta-Sans.txt',
          'OFL-Tajawal.txt',
          'README.md',
        ].map((name) => `${BRAND_ASSETS}/${name}`),
      ),
    )
    expect([...(source.assets as string[])].sort()).toEqual(assets)

    for (const rel of assets) {
      const original = fs.readFileSync(path.join(process.cwd(), rel))
      const expectedHash = `sha256-${crypto.createHash('sha256').update(original).digest('hex')}`
      expect(source.classOf(rel), rel).toBe('seeded')
      expect(source.readBytes(rel).equals(original), rel).toBe(true)
      expect(source.seeded[rel], rel).toBe(expectedHash)
      expect(source.hash(rel), rel).toBe(expectedHash)
      if (rel.endsWith('.woff2')) {
        // A text round trip loses real font bytes; this is not an ASCII fixture.
        expect(Buffer.from(original.toString('utf8')).equals(original), rel).toBe(false)
      }
    }
  })

  it('previews and installs real brand bytes, then remains idempotent', () => {
    expect(buildPayload({ repoRoot: process.cwd(), payloadRoot: out }).ok).toBe(true)
    const source = brandUpgradeSource()
    writeLock(fixture.project, emptyLock('1.0.0'))
    const initialLock = fixture.read('vuestrata.lock.json')
    const upgrade = (apply: boolean) =>
      runUpgrade({
        root: fixture.project,
        version: source.version,
        flags: FLAGS,
        apply,
        source,
        migrations: [],
      })

    const preview = upgrade(false)
    expect(fixture.read('vuestrata.lock.json')).toBe(initialLock)
    expect(fixture.exists(BRAND)).toBe(false)
    for (const rel of source.assets as string[]) {
      expect(fixture.exists(rel), rel).toBe(false)
      expect(preview.written).toContainEqual({ rel, reason: 'seeded' })
    }

    const applied = upgrade(true)
    expect(applied.written).toEqual(preview.written)
    expect(fixture.read(BRAND)).toBe(source.read(BRAND))
    const lock = readLock(fixture.project)
    for (const rel of source.assets as string[]) {
      expect(
        fs
          .readFileSync(path.join(fixture.project, rel))
          .equals(fs.readFileSync(path.join(process.cwd(), rel))),
        rel,
      ).toBe(true)
      expect(lock.files[rel], rel).toEqual({ class: 'seeded', since: source.version })
    }

    const installedLock = fixture.read('vuestrata.lock.json')
    const repeated = upgrade(true)
    expect(repeated.written).toEqual([])
    expect(repeated.adopted).toEqual([])
    expect(repeated.regions).toEqual([])
    expect(fixture.read('vuestrata.lock.json')).toBe(installedLock)
    for (const rel of source.assets as string[]) {
      expect(
        fs.readFileSync(path.join(fixture.project, rel)).equals(source.readBytes(rel)),
        rel,
      ).toBe(true)
    }
  })

  it('preserves project branding and font bytes, including tracked deletion and ejection', () => {
    expect(buildPayload({ repoRoot: process.cwd(), payloadRoot: out }).ok).toBe(true)
    const source = brandUpgradeSource()
    const fonts = (source.assets as string[]).filter((rel) => rel.endsWith('.woff2'))
    expect(fonts.length).toBeGreaterThanOrEqual(3)
    const [custom, deleted, ejected] = fonts as [string, string, string, ...string[]]
    const ownBrand = ':root { --font-sans: Project Sans }\n'
    const ownFont = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0xff, 0x0d, 0x0a, 0x80])
    fixture.write(BRAND, ownBrand)
    fs.mkdirSync(path.dirname(path.join(fixture.project, custom)), { recursive: true })
    fs.writeFileSync(path.join(fixture.project, custom), ownFont)
    const lock = emptyLock('1.0.0')
    lock.files[deleted] = { class: 'seeded', since: '1.0.0' }
    lock.ejected = [ejected]
    writeLock(fixture.project, lock)
    const upgrade = () =>
      runUpgrade({
        root: fixture.project,
        version: source.version,
        flags: FLAGS,
        apply: true,
        source,
        migrations: [],
      })

    const first = upgrade()
    expect(first.adopted).toEqual(
      expect.arrayContaining([
        { rel: BRAND, class: 'seeded', reason: 'already here' },
        { rel: custom, class: 'seeded', reason: 'already here' },
      ]),
    )
    expect(fixture.read(BRAND)).toBe(ownBrand)
    expect(fs.readFileSync(path.join(fixture.project, custom))).toEqual(ownFont)
    expect(fixture.exists(deleted)).toBe(false)
    expect(fixture.exists(ejected)).toBe(false)

    const editedBrand = `${ownBrand}/* Project changes after installation. */\n`
    const editedFont = Buffer.from([0x00, 0xfe, 0x0d, 0x0a, 0xff])
    fixture.write(BRAND, editedBrand)
    fs.writeFileSync(path.join(fixture.project, custom), editedFont)
    const repeated = upgrade()
    expect(repeated.written).toEqual([])
    expect(repeated.incoming).toEqual([])
    expect(fixture.read(BRAND)).toBe(editedBrand)
    expect(fs.readFileSync(path.join(fixture.project, custom))).toEqual(editedFont)
    expect(fixture.exists(deleted)).toBe(false)
    expect(fixture.exists(ejected)).toBe(false)
    expect(readLock(fixture.project).files[custom]).toEqual({
      class: 'seeded',
      since: source.version,
    })
  })

  it('detects same-length font tampering even when UTF-8 decoding hides the changed byte', () => {
    expect(buildPayload({ repoRoot: process.cwd(), payloadRoot: out }).ok).toBe(true)
    const source = createPayloadSource(out)
    const font = (source.assets as string[]).find((rel) => rel.endsWith('.woff2'))!
    const original = source.readBytes(font) as Buffer
    const offset = original.indexOf(0xff)
    expect(offset).toBeGreaterThanOrEqual(0)
    const tampered = Buffer.from(original)
    // FF and FE are both invalid UTF-8 bytes and decode to the same replacement.
    tampered[offset] = 0xfe
    expect(tampered.equals(original)).toBe(false)
    expect(tampered.length).toBe(original.length)
    expect(tampered.toString('utf8')).toBe(original.toString('utf8'))
    fs.writeFileSync(path.join(out, 'files', font), tampered)

    expect(source.hash(font)).not.toBe(source.seeded[font])
    const result = buildPayload({ repoRoot: process.cwd(), payloadRoot: out, check: true })
    expect(result.ok).toBe(false)
    expect(result.stale).toEqual([font])
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
