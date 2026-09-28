import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

// @ts-expect-error - the CLI is plain ESM JavaScript with no type declarations.
import { runUpgrade } from '../../../packages/cli/src/commands/upgrade.mjs'
// @ts-expect-error - see above.
import * as lockfile from '../../../packages/cli/src/lib/lockfile.mjs'
// @ts-expect-error - see above.
import { MERGED_FILES } from '../../../packages/cli/src/lib/managed.mjs'
// @ts-expect-error - see above.
import * as registry from '../../../packages/cli/src/lib/registry.mjs'
import { createFixture, type Fixture, writePayload } from './fixture'

/**
 * The region primitives an upgrade stands on: which lines of a file are the
 * project's (`app:`), and how Vuestrata's (`vuestrata:`) grow without undoing
 * anything the project did.
 */

const { emptyLock, readLock, regionHash, writeLock } = lockfile
const { appendToRegion, blankRegions, regionEntries, regionLines, regionNames, spliceRegions } =
  registry

const FLAGS = { 'allow-dirty': true, 'no-format': true }

const BARREL = [
  "export { default as UiButton } from './UiButton.vue'",
  '// vuestrata:ui-components-start',
  '// vuestrata:ui-components-end',
  '// app:ui-components-start',
  "export { default as UiTag } from './UiTag.vue'",
  '// app:ui-components-end',
  '',
].join('\n')

describe('blankRegions', () => {
  it('drops the body of every app: region and keeps the markers', () => {
    expect(blankRegions(BARREL)).toBe(
      [
        "export { default as UiButton } from './UiButton.vue'",
        '// vuestrata:ui-components-start',
        '// vuestrata:ui-components-end',
        '// app:ui-components-start',
        '// app:ui-components-end',
        '',
      ].join('\n'),
    )
  })

  it('reads all three comment styles', () => {
    const css = "/* app:theme-imports-start */\n@import './x.css';\n/* app:theme-imports-end */\n"
    const env = '# app:env-start\nMY_VAR=1\n# app:env-end\n'
    const ts = '  // app:themes-start\n  { name: "x" },\n  // app:themes-end\n'

    expect(blankRegions(css)).toBe('/* app:theme-imports-start */\n/* app:theme-imports-end */\n')
    expect(blankRegions(env)).toBe('# app:env-start\n# app:env-end\n')
    expect(blankRegions(ts)).toBe('  // app:themes-start\n  // app:themes-end\n')
  })

  it('leaves vuestrata: regions alone — those are the part that is compared', () => {
    const source = '// vuestrata:modules-start\nfooModule,\n// vuestrata:modules-end\n'
    expect(blankRegions(source)).toBe(source)
  })

  it('keeps Windows line endings', () => {
    expect(blankRegions('a\r\n// app:x-start\r\nmine\r\n// app:x-end\r\nb\r\n')).toBe(
      'a\r\n// app:x-start\r\n// app:x-end\r\nb\r\n',
    )
  })

  it('blanks nothing it cannot delimit', () => {
    const unclosed = '// app:modules-start\nfooModule,\nbarModule,\n'
    expect(blankRegions(unclosed)).toBe(unclosed)
  })
})

describe('spliceRegions', () => {
  const incoming = [
    "export { default as UiButton } from './UiButton.vue'",
    "export { default as UiBadge } from './UiBadge.vue'",
    '// app:ui-components-start',
    '// app:ui-components-end',
    '',
  ].join('\n')

  it("carries the project's app: entries into the new version", () => {
    const { contents, warnings } = spliceRegions(incoming, BARREL)

    expect(contents).toBe(
      [
        "export { default as UiButton } from './UiButton.vue'",
        "export { default as UiBadge } from './UiBadge.vue'",
        '// app:ui-components-start',
        "export { default as UiTag } from './UiTag.vue'",
        '// app:ui-components-end',
        '',
      ].join('\n'),
    )
    expect(warnings).toEqual([])
  })

  it('leaves a region the project does not have empty', () => {
    const upstream = '// app:new-start\nshipped by mistake\n// app:new-end\n'
    expect(spliceRegions(upstream, 'nothing here\n').contents).toBe(
      '// app:new-start\n// app:new-end\n',
    )
  })

  it('reports a region the new version dropped, with what it held', () => {
    const dropped = "export { default as UiButton } from './UiButton.vue'\n"
    const { warnings } = spliceRegions(dropped, BARREL)

    expect(warnings).toEqual([
      {
        region: 'app:ui-components',
        lines: ["export { default as UiTag } from './UiTag.vue'"],
      },
    ])
  })

  it('pairs a repeated region in order, and reports a copy it has nowhere to put', () => {
    const current = '// app:x-start\none\n// app:x-end\n// app:x-start\ntwo\n// app:x-end\n'
    const { contents, warnings } = spliceRegions('// app:x-start\n// app:x-end\n', current)

    expect(contents).toBe('// app:x-start\none\n// app:x-end\n')
    expect(warnings).toEqual([{ region: 'app:x', lines: ['two'] }])
  })

  it('writes the line endings of the new version', () => {
    const crlf = incoming.replaceAll('\n', '\r\n')
    expect(spliceRegions(crlf, BARREL).contents).toContain(
      "// app:ui-components-start\r\nexport { default as UiTag } from './UiTag.vue'\r\n",
    )
  })
})

describe('regionEntries', () => {
  it('keys ordinary registries by the trimmed line', () => {
    expect(regionEntries(['  fooModule,', '', '  barModule,'])).toEqual([
      { key: 'fooModule,', lines: ['fooModule,'] },
      { key: 'barModule,', lines: ['barModule,'] },
    ])
  })

  it('keys .env.example by variable, with the comments that document it', () => {
    const entries = regionEntries(
      [
        '# Where the API lives.',
        'VUESTRATA_API_URL=/api',
        '',
        '# Optional.',
        '# VUESTRATA_TRACE=false',
        '# A trailing remark.',
      ],
      { keyedBy: 'variable' },
    )

    expect(entries).toEqual([
      { key: 'VUESTRATA_API_URL', lines: ['# Where the API lives.', 'VUESTRATA_API_URL=/api'] },
      { key: 'VUESTRATA_TRACE', lines: ['# Optional.', '# VUESTRATA_TRACE=false'] },
      { key: '# A trailing remark.', lines: ['# A trailing remark.'] },
    ])
  })

  it('hashes what an entry is, not how it is written', () => {
    const before = regionEntries(['VUESTRATA_X=1'], { keyedBy: 'variable' })
    const after = regionEntries(['# Now documented.', 'VUESTRATA_X=2'], { keyedBy: 'variable' })
    expect(regionHash(before)).toBe(regionHash(after))
  })
})

describe('appendToRegion', () => {
  it('appends before the closing marker, at its indentation', () => {
    const source = 'export const x = [\n  // vuestrata:themes-start\n  // vuestrata:themes-end\n]\n'
    const next = appendToRegion(source, 'vuestrata:themes', [
      { key: "{ name: 'a' },", lines: ["{ name: 'a' },"] },
    ])

    expect(next).toBe(
      "export const x = [\n  // vuestrata:themes-start\n  { name: 'a' },\n  // vuestrata:themes-end\n]\n",
    )
    expect(regionLines(next, 'vuestrata:themes')).toEqual(["  { name: 'a' },"])
  })

  it('separates documented variables with a blank line', () => {
    const source = '# vuestrata:env-start\nVUESTRATA_A=1\n# vuestrata:env-end\n'
    const next = appendToRegion(
      source,
      'vuestrata:env',
      [{ key: 'VUESTRATA_B', lines: ['# B.', 'VUESTRATA_B=2'] }],
      { keyedBy: 'variable' },
    )
    expect(next).toBe(
      '# vuestrata:env-start\nVUESTRATA_A=1\n\n# B.\nVUESTRATA_B=2\n# vuestrata:env-end\n',
    )
  })

  it('refuses a region that is not there rather than appending somewhere plausible', () => {
    expect(() => appendToRegion('nothing\n', 'vuestrata:themes', [])).toThrow(/not found/)
  })
})

describe('the merged files in this repository', () => {
  // A merged file with nothing to merge would be a managed file under a
  // misleading name. The payload build refuses one; this says which.
  it.each(MERGED_FILES as string[])('%s carries an app: region', (rel) => {
    const source = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
    expect(regionNames(source).length).toBeGreaterThan(0)
  })
})

describe('region sync', () => {
  let fixture: Fixture

  const THEMES = 'src/modules/app/config/theme.config.ts'
  const ENV = '.env.example'

  const themes = (...entries: string[]) =>
    [
      'const builtinThemes = [',
      "  { name: 'default' },",
      '  // vuestrata:themes-start',
      ...entries.map((entry) => `  ${entry}`),
      '  // vuestrata:themes-end',
      '  // app:themes-start',
      "  { name: 'mine' },",
      '  // app:themes-end',
      ']',
      '',
    ].join('\n')

  function seed({ themeEntries, recorded }: { themeEntries: string[]; recorded?: string[] }) {
    fixture.write(THEMES, themes(...themeEntries))
    const lock = emptyLock('1.0.0')
    if (recorded) {
      lock.regions[THEMES] = {
        'vuestrata:themes': regionHash(recorded.map((key) => ({ key, lines: [key] }))),
      }
    }
    writeLock(fixture.project, lock)
  }

  function upgrade(regions: Record<string, Record<string, string[]>>, apply = true) {
    return runUpgrade({
      root: fixture.project,
      version: '1.1.0',
      flags: FLAGS,
      apply,
      source: writePayload(fixture.payload, { version: '1.1.0', regions }),
      migrations: [],
    })
  }

  beforeEach(() => {
    fixture = createFixture()
  })

  afterEach(() => {
    fixture.cleanup()
  })

  it('adds a new upstream entry and keeps what the project has', () => {
    // `analog` was dropped upstream; append-only means it stays here.
    seed({
      themeEntries: ["{ name: 'pro' },", "{ name: 'analog' },"],
      recorded: ["{ name: 'pro' },", "{ name: 'analog' },"],
    })

    const report = upgrade({
      themeRegistry: { themes: ["{ name: 'pro' },", "{ name: 'midnight' },"] },
    })

    expect(fixture.read(THEMES)).toBe(
      themes("{ name: 'pro' },", "{ name: 'analog' },", "{ name: 'midnight' },"),
    )
    expect(report.regions).toEqual([
      { rel: THEMES, region: 'vuestrata:themes', added: ["{ name: 'midnight' },"] },
    ])

    // The new baseline is what is there now, so the next upgrade sees it clean.
    const recorded = readLock(fixture.project).regions[THEMES]['vuestrata:themes']
    expect(recorded).toBe(
      regionHash(
        ["{ name: 'pro' },", "{ name: 'analog' },", "{ name: 'midnight' },"].map((key) => ({
          key,
          lines: [key],
        })),
      ),
    )
  })

  it('skips a region edited since the last upgrade, with a note', () => {
    // The project removed `analog` on purpose; appending it back would undo that.
    seed({
      themeEntries: ["{ name: 'pro' },"],
      recorded: ["{ name: 'pro' },", "{ name: 'analog' },"],
    })

    const report = upgrade({
      themeRegistry: {
        themes: ["{ name: 'pro' },", "{ name: 'analog' },", "{ name: 'midnight' },"],
      },
    })

    expect(fixture.read(THEMES)).toBe(themes("{ name: 'pro' },"))
    expect(report.regions).toEqual([])
    expect(report.skipped).toEqual([{ rel: THEMES, reason: 'vuestrata:themes edited here' }])
    expect(report.notes.map((note: { text: string }) => note.text).join('\n')).toMatch(
      /vuestrata:themes in .*theme\.config\.ts was edited.*midnight.*vuestrata adopt/s,
    )
  })

  it('takes a region with no recorded baseline as it stands, and records one', () => {
    seed({ themeEntries: ["{ name: 'pro' },"] })

    upgrade({ themeRegistry: { themes: ["{ name: 'pro' },", "{ name: 'midnight' },"] } })

    expect(fixture.read(THEMES)).toBe(themes("{ name: 'pro' },", "{ name: 'midnight' },"))
    expect(readLock(fixture.project).regions[THEMES]['vuestrata:themes']).toBeDefined()
  })

  it('never adds an entry the file already has elsewhere', () => {
    seed({ themeEntries: [], recorded: [] })

    // The project registered `mine` itself, in its app: region.
    upgrade({ themeRegistry: { themes: ["{ name: 'mine' },"] } })

    expect(fixture.read(THEMES)).toBe(themes())
  })

  it('keys .env.example by variable', () => {
    fixture.write(
      ENV,
      [
        '# vuestrata:env-start',
        '# Where the API lives — our value, not the shipped one.',
        'VUESTRATA_API_URL=https://api.example.test',
        '# vuestrata:env-end',
        '# app:env-start',
        '# app:env-end',
        '',
      ].join('\n'),
    )
    writeLock(fixture.project, emptyLock('1.0.0'))

    upgrade({
      envExample: {
        env: [
          '# Where the API lives.',
          'VUESTRATA_API_URL=/api',
          '# Proxy target for `vpr dev`. Never inlined into the bundle.',
          'DEV_API_TARGET=http://localhost:8000',
        ],
      },
    })

    expect(fixture.read(ENV)).toBe(
      [
        '# vuestrata:env-start',
        '# Where the API lives — our value, not the shipped one.',
        'VUESTRATA_API_URL=https://api.example.test',
        '',
        '# Proxy target for `vpr dev`. Never inlined into the bundle.',
        'DEV_API_TARGET=http://localhost:8000',
        '# vuestrata:env-end',
        '# app:env-start',
        '# app:env-end',
        '',
      ].join('\n'),
    )
  })

  it('previews the same append in diff and writes nothing', () => {
    seed({ themeEntries: [], recorded: [] })
    const before = fixture.read(THEMES)
    const regions = { themeRegistry: { themes: ["{ name: 'midnight' },"] } }

    const preview = upgrade(regions, false)
    expect(fixture.read(THEMES)).toBe(before)

    const actual = upgrade(regions, true)
    expect(preview.regions).toEqual(actual.regions)
    expect(actual.regions).toHaveLength(1)
  })

  it('leaves a registry whose markers are gone, and says what it could not add', () => {
    fixture.write(THEMES, 'const builtinThemes = []\n')
    writeLock(fixture.project, emptyLock('1.0.0'))

    const report = upgrade({ themeRegistry: { themes: ["{ name: 'midnight' },"] } })

    expect(fixture.read(THEMES)).toBe('const builtinThemes = []\n')
    expect(report.notes.map((note: { text: string }) => note.text).join('\n')).toMatch(
      /has no vuestrata:themes region.*midnight/s,
    )
  })
})
