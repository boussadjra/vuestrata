import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { CLI_PRESENT, loadCli, MAINTAINER } from './cli'
import { createFixture, type Fixture, hash, writePayload } from './fixture'
import { atTag, FROM, hasTags, inRepo, lf, released, REPO, TAGS } from './release-tags'

// Loaded rather than imported, so a project without `packages/cli` skips this
// file instead of failing to collect it.
const { runUpgrade } = await loadCli('src/commands/upgrade.mjs')
const { emptyLock, hashFor, readLock, writeLock } = await loadCli('src/lib/lockfile.mjs')
const { loadManifest } = await loadCli('src/lib/manifest.mjs')
const { collectMigrationsAsync, stepTarget } = await loadCli('src/lib/migrations.mjs')
const { importStartLocation } = await loadCli('migrations/1.1.0/project-files.mjs')
const { declaresBinding, jsonStringSpan, withoutComments } = await loadCli(
  'migrations/1.1.0/text.mjs',
)
const { checkShipped, SHIPPED, shippedCopy } = await loadCli('migrations/1.1.0/shipped.mjs')

/**
 * What the 1.1.0 migration does to the files a project owns.
 *
 * The promotions (promotions-1.1.0.test.ts) hand Vuestrata files it maintains
 * from now on. These steps are the other half: the project's own files, which
 * an upgrade may only touch where they are still exactly what a release
 * shipped. So every case here starts from the release itself, read from its
 * tag, and the two questions are always the same: was an unedited file brought
 * to what 1.1.0 ships, and was an edited one left alone and told why.
 */

// Each case writes a project to disk and runs the whole migration list, and the
// tag lookups start a git process per file.
vi.setConfig({ testTimeout: 60_000 })

const FLAGS = { 'allow-dirty': true, 'no-format': true }
const TO = '1.1.0-alpha.0'

interface Note {
  version?: string
  rel?: string
  text: string
}

interface Report {
  notes: Note[]
  incoming: Array<{ rel: string; incoming: string }>
  adopted: Array<{ rel: string; class: string; reason: string }>
  written: Array<{ rel: string }>
  migrations: Array<{ description: string; changed: string[] }>
}

interface Step {
  kind?: string
  file?: unknown
  slot?: string
  pristine?: string[]
}

let fixture: Fixture

beforeEach(() => {
  fixture = createFixture()
})

afterEach(() => {
  fixture.cleanup()
})

/** A project that holds `rels` exactly as 1.0.1-alpha.6 shipped them. */
function seed(rels: string[]) {
  for (const rel of rels) fixture.write(rel, released(rel))
  writeLock(fixture.project, emptyLock(FROM))
}

/** Upgrade the fixture. `files` is what this release ships as managed, where a case needs any. */
async function upgrade(
  files: Record<string, string> = {},
  { version = TO, merged = {} }: { version?: string; merged?: Record<string, string> } = {},
): Promise<Report> {
  return runUpgrade({
    root: fixture.project,
    version,
    flags: FLAGS,
    apply: true,
    source: writePayload(fixture.payload, { version, files, merged }),
    migrations: await collectMigrationsAsync(FROM, version),
  })
}

const texts = (report: Report) => report.notes.map((note) => note.text)
const changed = (report: Report) => report.migrations.flatMap((entry) => entry.changed)
const incoming = (rel: string) => `.vuestrata/incoming/${rel}`

/**
 * What an unedited 1.0.1-alpha.6 file becomes. Recorded as hashes, not read
 * from this checkout: the files go on changing, and what the migration wrote in
 * 1.1.0-alpha.0 does not. A later migration that wants to replace one of these
 * again needs exactly this hash in its `pristine` list.
 */
const BECOMES: Record<string, string> = {
  'src/modules/app/plugins/router.ts':
    'sha256-c16bd27f487fc5e8d3e62ad80be1143aaaa15a6fab5334cd9b8190f5a07a8bbe',
  'src/modules/app/plugins/stale-chunk.ts':
    'sha256-fcb5e00e0064205e5b64ec5393db49aafd956ae4f98935e4aed3ad1cf57c6f9f',
  'src/modules/auth/pages/login.vue':
    'sha256-1f006949a32b6ba109ddad138a83c2b1d3480887f6946f5af8cde0df830a3939',
  'docs/6.configuration/2.auth-rbac.md':
    'sha256-06a27b89e0a751c451a8199ba817b1ecba5dc76b10c42053ab4252ce3877bff2',
  'docs/6.configuration/3.auth-deep-dive.md':
    'sha256-b9cc6974f9c891df2a6b9a4878d34286c174619da54fb40926171cb01b37769b',
  'docs/8.deployment/1.vercel-demo.md':
    'sha256-232b5e9a9a0ebeb8b36df47639912c755317e43d2cbf7b0176c2a351c659deee',
  'src/modules/showcase/pages/forms.vue':
    'sha256-61f5ae4a05b7434b860775a9e2ff9453b94f621991058b99aee83eeea5fe0439',
  'e2e/forms.spec.ts': 'sha256-5173d57b438e6f70c4595f4b4a55c91bd39766d31c17b16de9af5088b99b0d47',
  // After its four codemods: the env plugin import (promotions), the test
  // block, `.vuestrata/` in the ignore lists, and the vendor chunk groups.
  'vite.config.ts': 'sha256-a9f848e66ee39ec31e8e39010457d3f9a50a2e3698580cd5bfb21610f91898c7',
  'test/stores.test.ts': 'sha256-b3059a058cd1090b419d50510ac25f2a15c31a71a3b6366471dcac4ef9e94a8d',
  'test/unit/composables/use-rbac.test.ts':
    'sha256-282e7036330f710e4b21945162fc75cc87b4535f1c5b8da0d3025becc9f4cfec',
  'test/integration/composables/use-rbac.test.ts':
    'sha256-282e7036330f710e4b21945162fc75cc87b4535f1c5b8da0d3025becc9f4cfec',
  'test/unit/auth/adapters.test.ts':
    'sha256-00eeffd325534867805cf59d886890ab58988b9185b6a769c280b68003d29be1',
  'test/unit/auth/oauth-pkce.test.ts':
    'sha256-461151c23e13a5d0c080d784a10a376e0a97c4024ae57d702e88e3f923be1688',
  'test/unit/architecture/public-surface.test.ts':
    'sha256-6efb56ac38ddd17df23cd576c0dd8c8d2d924e46d4a18126d806eaf66f298743',
  'test/unit/architecture/registry-drift.test.ts':
    'sha256-9e48b68483a06291041744a17d622ed6237ccf0aa3a617e2b27b20cfac676a8e',
  'test/unit/architecture/module-contract.test.ts':
    'sha256-828340de2d999503c7f142e65165bc6f08e8abf05f140a44a7fe66262f43428a',
}

/** The literals `verify-bundle.mjs --mode=production` rejects anywhere in a bundle. */
const DEMO_LITERALS = ['demo@vuestrata.dev', 'vuestrata-demo-auth', 'vuestrata-demo-v1']

const PACKAGE = 'package.json'
const ROUTER = 'src/modules/app/plugins/router.ts'
const STALE_CHUNK = 'src/modules/app/plugins/stale-chunk.ts'
const LOGIN = 'src/modules/auth/pages/login.vue'
const AUTH_RBAC = 'docs/6.configuration/2.auth-rbac.md'
const DEEP_DIVE = 'docs/6.configuration/3.auth-deep-dive.md'
const VERCEL = 'docs/8.deployment/1.vercel-demo.md'
const FORMS = 'src/modules/showcase/pages/forms.vue'
const FORMS_SPEC = 'e2e/forms.spec.ts'
const HEADERS = 'scripts/security/headers.mjs'
const SYNC = 'scripts/security/sync-headers.mjs'
const SPEC = 'e2e/production-artifact.spec.ts'
const CI = '.github/workflows/ci.yml'
const JWT = 'src/modules/auth/adapters/jwt.ts'

const PINNED_TESTS = Object.keys(BECOMES).filter((rel) => rel.startsWith('test/'))

/** The standing reminder that follows a replaced pair of header generators. */
const REMINDER = /were replaced .*run `vpr security:headers`/s

describe.skipIf(!CLI_PRESENT)('the 1.1.0 migration data', () => {
  it.skipIf(!hasTags)(
    'gives each merged file the hash the tags produce the merged way',
    async () => {
      const manifest = loadManifest(REPO)
      const steps: Step[] = (await collectMigrationsAsync(FROM, TO)).flatMap(
        (migration: { steps: Step[] }) =>
          migration.steps.filter((step) => step.kind === 'reclassify'),
      )

      expect(steps.map((step) => step.slot)).toEqual([
        'uiBarrel',
        'formComposablesBarrel',
        'permissions',
      ])
      for (const step of steps) {
        const rel: string = stepTarget(step, manifest)
        const produced = new Set(TAGS.map((tag) => hashFor(rel, atTag(tag, rel), 'merged')))
        expect([...produced], rel).toEqual(step.pristine)
      }
    },
  )

  it.skipIf(!hasTags)('gives each file it replaces whole the hash the tags produced', () => {
    for (const [rel, pristine] of Object.entries(SHIPPED as Record<string, string[]>)) {
      const produced = new Set(
        TAGS.map((tag) => atTag(tag, rel)).map((contents) =>
          contents === null ? null : hash(contents),
        ),
      )
      expect([...produced], rel).toEqual(pristine)
    }
  })

  // A project edits its Dockerfile and its workflow as a matter of course, so
  // only the template is held to shipping what the migration installs.
  it.runIf(MAINTAINER)('installs the copies of those files that this repository ships', () => {
    expect(
      checkShipped(),
      'refresh them: node packages/cli/migrations/1.1.0/shipped.mjs --write',
    ).toEqual([])
  })
})

describe.skipIf(!CLI_PRESENT)('importStartLocation', () => {
  it('adds the name ahead of the type imports, one to a line, as the shipped file has it', () => {
    const before = [
      "import NProgress from 'nprogress'",
      'import {',
      '  createRouter,',
      '  createWebHistory,',
      '  type RouteComponent,',
      '  type RouteRecordRaw,',
      "} from 'vue-router'",
      '',
    ].join('\n')

    expect(importStartLocation(before)).toBe(
      before.replace('  createWebHistory,\n', '  createWebHistory,\n  START_LOCATION,\n'),
    )
  })

  it('keeps a short import on one line', () => {
    expect(
      importStartLocation("import { createRouter, createWebHistory } from 'vue-router'\n"),
    ).toBe("import { createRouter, createWebHistory, START_LOCATION } from 'vue-router'\n")
  })

  it('breaks an import that no longer fits the print width', () => {
    const before =
      "import { createRouter, createWebHistory, type RouteComponent, type RouteRecordRaw } from 'vue-router'\n"

    expect(importStartLocation(before)).toBe(
      [
        'import {',
        '  createRouter,',
        '  createWebHistory,',
        '  START_LOCATION,',
        '  type RouteComponent,',
        '  type RouteRecordRaw,',
        "} from 'vue-router'",
        '',
      ].join('\n'),
    )
  })

  it('leaves an import that already has it, and keeps the quotes a project uses', () => {
    const has = "import { createRouter, START_LOCATION } from 'vue-router'\n"
    expect(importStartLocation(has)).toBe(has)
    expect(importStartLocation('import { createRouter } from "vue-router"\n')).toBe(
      'import { createRouter, START_LOCATION } from "vue-router"\n',
    )
  })

  it('finds nothing to extend in a file with no value import from vue-router', () => {
    expect(importStartLocation("import type { Router } from 'vue-router'\n")).toBeUndefined()
    expect(importStartLocation("import { createRouter } from 'vue-router/auto'\n")).toBeUndefined()
  })

  it('keeps the semicolon a statement ended on', () => {
    expect(importStartLocation("import { createRouter } from 'vue-router';\n")).toBe(
      "import { createRouter, START_LOCATION } from 'vue-router';\n",
    )
  })

  it('does not import the name a second time when another statement already does', () => {
    const has = [
      "import { createRouter, createWebHistory } from 'vue-router'",
      "import { START_LOCATION } from 'vue-router'",
      '',
    ].join('\n')

    expect(importStartLocation(has)).toBe(has)
  })

  it('keeps a comment that sits among the imported names', () => {
    const before = [
      'import {',
      '  createRouter,',
      '  // history mode: the server rewrites every path to index.html',
      '  createWebHistory,',
      "} from 'vue-router'",
      '',
    ].join('\n')

    expect(importStartLocation(before)).toBe(
      before.replace('import {\n', 'import {\n  START_LOCATION,\n'),
    )
    expect(importStartLocation("import { createRouter /* v4 */ } from 'vue-router'\n")).toBe(
      "import { START_LOCATION, createRouter /* v4 */ } from 'vue-router'\n",
    )
  })
})

describe.skipIf(!CLI_PRESENT)('what a codemod asks of a file before it inserts something', () => {
  describe('declaresBinding', () => {
    it.each([
      ['a const', "const reason = useRouteQueryParam('reason')"],
      ['a let', 'let reason: string | undefined'],
      ['a var', 'var reason'],
      ['a function', 'function reason() {}'],
      ['a destructured name', 'const { error, reason } = useAuth()'],
      ['a destructured alias', 'const { message: reason } = props'],
      ['a destructured name with a default', "const { tries = 3, reason = 'none' } = options"],
      ['an array pattern', 'const [reason, setReason] = useState()'],
      ['a default import', "import reason from './reason'"],
      ['a named import', "import { other, reason } from './reasons'"],
      ['an aliased import', "import { why as reason } from './reasons'"],
      ['a namespace import', "import * as reason from './reasons'"],
      ['a type import', "import type { reason } from './reasons'"],
    ])('finds %s', (_what, source) => {
      expect(declaresBinding(`${source}\n`, 'reason')).toBe(true)
    })

    it.each([
      ['a property', 'const state = { reason: 1 }'],
      ['a member read', 'if (route.query.reason) show()'],
      ['a destructured source key', 'const { reason: why } = props'],
      ['the original name of an aliased import', "import { reason as why } from './reasons'"],
      ['a longer name', 'const reasonText = 1\nconst unreason = 2'],
      ['a string', "const label = 'const reason = 1'"],
      ['a comment', '// const reason = 1\n/* let reason */'],
    ])('does not take %s for a declaration', (_what, source) => {
      expect(declaresBinding(`${source}\n`, 'reason')).toBe(false)
    })
  })

  describe('withoutComments', () => {
    it('blanks both comment forms and keeps strings, lines and the rest', () => {
      const source = [
        "const url = 'https://example.com/a' // not // a comment in the string",
        '/* testTimeout: 1,',
        '   two lines */ const kept = `a // b`',
        '',
      ].join('\n')

      expect(withoutComments(source)).toBe(
        ["const url = 'https://example.com/a' ", '', ' const kept = `a // b`', ''].join('\n'),
      )
    })
  })

  describe('jsonStringSpan', () => {
    const source = [
      '{',
      '  "name": "acme",',
      '  "config": { "scripts": { "lint": "nested" } },',
      '  "scripts": {',
      '    "lint:all": "vp lint",',
      '    "lint": "vp lint",',
      '    "say": "echo \\"lint\\": \\"vp lint\\""',
      '  },',
      '  "files": ["lint"]',
      '}',
      '',
    ].join('\n')

    it('finds the string at a path, and only there', () => {
      const span = jsonStringSpan(source, ['scripts', 'lint'])

      expect(source.slice(span.start, span.end)).toBe('"vp lint"')
      // The second `"vp lint"` in the text: the first belongs to `lint:all`.
      expect(span.start).toBe(source.indexOf('"lint": "vp lint"') + '"lint": '.length)
    })

    it('finds nothing where there is no string', () => {
      expect(jsonStringSpan(source, ['scripts', 'test'])).toBeUndefined()
      expect(jsonStringSpan(source, ['files'])).toBeUndefined()
      expect(jsonStringSpan('{ "scripts": { "lint": 3 } }', ['scripts', 'lint'])).toBeUndefined()
    })
  })
})

describe.skipIf(!CLI_PRESENT || !hasTags)('upgrading the files a project owns', () => {
  describe('package.json', () => {
    const STEP = ' && node scripts/release/check-template-lock.mjs'

    it('takes the template-lock check out of the lint script, and changes nothing else', async () => {
      seed([PACKAGE])
      expect(released(PACKAGE)).toContain(STEP)

      const report = await upgrade()

      expect(fixture.read(PACKAGE)).toBe(released(PACKAGE).replace(STEP, ''))
      expect(changed(report)).toEqual([PACKAGE])
      expect(report.notes).toEqual([])
    })

    it('takes it out of the middle of a chain too', async () => {
      seed([PACKAGE])
      fixture.write(PACKAGE, released(PACKAGE).replace(`${STEP}"`, `${STEP} && vp fmt --check"`))

      await upgrade()

      const lint: string = JSON.parse(fixture.read(PACKAGE)).scripts.lint
      expect(lint).not.toContain('check-template-lock')
      expect(lint.endsWith(' --quiet && vp fmt --check')).toBe(true)
    })

    it('leaves a script that runs the check in a form of its own, and says so', async () => {
      seed([PACKAGE])
      // With an argument, cutting the step out would hand `--json` to the command before it.
      const custom = released(PACKAGE).replace(`${STEP}"`, `${STEP} --json"`)
      fixture.write(PACKAGE, custom)

      const report = await upgrade()

      expect(fixture.read(PACKAGE)).toBe(custom)
      expect(texts(report)).toEqual([expect.stringMatching(/check-template-lock\.mjs.*by hand/s)])
      expect(fixture.exists(incoming(PACKAGE))).toBe(false)
    })

    it('has nothing to say to a project whose lint script never ran it', async () => {
      seed([PACKAGE])
      fixture.write(PACKAGE, released(PACKAGE).replace(STEP, ''))

      const report = await upgrade()

      expect(changed(report)).toEqual([])
      expect(report.notes).toEqual([])
    })

    it('edits scripts.lint, not a script declared above it that runs the same command', async () => {
      seed([PACKAGE])
      const lint: string = JSON.parse(released(PACKAGE)).scripts.lint
      // The same text twice: first under a key of the project's, then under `lint`.
      const twice = released(PACKAGE).replace(
        '    "lint": ',
        `    "lint:all": ${JSON.stringify(lint)},\n    "lint": `,
      )
      expect(JSON.parse(twice).scripts['lint:all']).toBe(lint)
      fixture.write(PACKAGE, twice)

      const report = await upgrade()

      const scripts = JSON.parse(fixture.read(PACKAGE)).scripts
      expect(scripts.lint).toBe(lint.replace(STEP, ''))
      // The project's own script is its own business.
      expect(scripts['lint:all']).toBe(lint)
      expect(fixture.read(PACKAGE)).toBe(
        twice.replace(
          `    "lint": ${JSON.stringify(lint)}`,
          `    "lint": ${JSON.stringify(lint.replace(STEP, ''))}`,
        ),
      )
      expect(report.notes).toEqual([])
    })

    it('takes every occurrence of the step out in one pass', async () => {
      seed([PACKAGE])
      fixture.write(
        PACKAGE,
        released(PACKAGE).replace(`${STEP}"`, `${STEP} && vp fmt --check${STEP}"`),
      )

      const report = await upgrade()

      const lint: string = JSON.parse(fixture.read(PACKAGE)).scripts.lint
      expect(lint).not.toContain('check-template-lock')
      expect(lint.endsWith(' --quiet && vp fmt --check')).toBe(true)
      expect(report.notes).toEqual([])

      const again = await upgrade({}, { version: '1.1.0-alpha.1' })
      expect(changed(again)).toEqual([])
    })
  })

  describe('plugins/router.ts', () => {
    it('guards the marker in an unedited file, which becomes the one this release ships', async () => {
      seed([ROUTER])

      const report = await upgrade()

      const result = fixture.read(ROUTER)
      expect(hash(result)).toBe(BECOMES[ROUTER])
      expect(result).toContain('router.afterEach((_to, from, failure) => {')
      expect(result).toContain('if (!failure && from !== START_LOCATION) clearStaleChunkMarker()')
      expect(result).toContain('  START_LOCATION,\n')
      expect(report.notes).toEqual([])
    })

    it('makes the same change in a file the project added a layout to', async () => {
      seed([ROUTER])
      const edited = released(ROUTER).replace(
        'export const layoutMap',
        '// our own layouts are registered below\nexport const layoutMap',
      )
      expect(edited).not.toBe(released(ROUTER))
      fixture.write(ROUTER, edited)

      const report = await upgrade()

      const result = fixture.read(ROUTER)
      expect(result).toContain('// our own layouts are registered below')
      expect(result).toContain('if (!failure && from !== START_LOCATION) clearStaleChunkMarker()')
      expect(result).toContain('  START_LOCATION,\n')
      expect(report.notes).toEqual([])
    })

    it('keeps the line endings the file had', async () => {
      seed([ROUTER])
      fixture.write(ROUTER, released(ROUTER).replaceAll('\n', '\r\n'))

      await upgrade()

      const result = fixture.read(ROUTER)
      expect(result).not.toMatch(/[^\r]\n/)
      expect(hash(result)).toBe(BECOMES[ROUTER])
    })

    it('leaves an afterEach the project rewrote, with the change to make by hand', async () => {
      seed([ROUTER])
      const edited = released(ROUTER).replace(
        '  clearStaleChunkMarker()\n})',
        '  clearStaleChunkMarker()\n  trackPageView()\n})',
      )
      expect(edited).not.toBe(released(ROUTER))
      fixture.write(ROUTER, edited)

      const report = await upgrade()

      expect(fixture.read(ROUTER)).toBe(edited)
      expect(texts(report)).toEqual([
        expect.stringContaining('if (!failure && from !== START_LOCATION) clearStaleChunkMarker()'),
      ])
      expect(report.notes[0]?.rel).toBe(ROUTER)
    })

    it('is quiet once the guard is there, however the project wrote the rest', async () => {
      seed([ROUTER])
      await upgrade()
      const custom = `${fixture.read(ROUTER)}\n// ours\n`
      fixture.write(ROUTER, custom)

      const again = await upgrade({}, { version: '1.1.0-alpha.1' })

      expect(fixture.read(ROUTER)).toBe(custom)
      expect(again.notes).toEqual([])
      expect(changed(again)).toEqual([])
    })

    it('reads the guard with its two conditions in either order', async () => {
      seed([ROUTER])
      await upgrade()
      const swapped = fixture
        .read(ROUTER)
        .replace(
          'if (!failure && from !== START_LOCATION) clearStaleChunkMarker()',
          'if (from !== START_LOCATION && !failure) {\n    clearStaleChunkMarker()\n  }',
        )
      expect(swapped).toContain('from !== START_LOCATION && !failure')
      fixture.write(ROUTER, swapped)

      const again = await upgrade({}, { version: '1.1.0-alpha.1' })

      expect(fixture.read(ROUTER)).toBe(swapped)
      expect(again.notes).toEqual([])
    })

    it('counts the calls: a second hook that clears without the guard is still noted', async () => {
      seed([ROUTER])
      await upgrade()
      // One guarded call, which the upgrade wrote, and one of the project's own.
      const second = `${fixture.read(ROUTER)}\nrouter.afterEach(() => {\n  clearStaleChunkMarker()\n})\n`
      fixture.write(ROUTER, second)

      const again = await upgrade({}, { version: '1.1.0-alpha.1' })

      expect(fixture.read(ROUTER)).toBe(second)
      expect(texts(again)).toEqual([
        expect.stringContaining('Every call to clearStaleChunkMarker() in the file needs that'),
      ])
    })

    it('does not import START_LOCATION a second time into a file that already has it', async () => {
      seed([ROUTER])
      const has = `import { START_LOCATION } from 'vue-router'\n${released(ROUTER)}`
      fixture.write(ROUTER, has)

      const report = await upgrade()

      const result = fixture.read(ROUTER)
      expect(result).toContain('if (!failure && from !== START_LOCATION) clearStaleChunkMarker()')
      // The one import the project wrote, and no second one in the shipped statement.
      expect(result.startsWith("import { START_LOCATION } from 'vue-router'\n")).toBe(true)
      expect(result).not.toContain('  START_LOCATION,\n')
      expect(report.notes).toEqual([])
    })
  })

  describe('plugins/stale-chunk.ts', () => {
    it('reloads only for an attempt it could record, in an unedited file', async () => {
      seed([STALE_CHUNK])

      const report = await upgrade()

      const result = fixture.read(STALE_CHUNK)
      expect(hash(result)).toBe(BECOMES[STALE_CHUNK])
      expect(result).toContain('function markReloadAttempted(): boolean {')
      expect(result).toContain('if (!markReloadAttempted()) {')
      expect(result).not.toContain('  markReloadAttempted()\n  reload()')
      expect(report.notes).toEqual([])
    })

    it('leaves a file the project changed, with the change to make by hand', async () => {
      seed([STALE_CHUNK])
      const edited = released(STALE_CHUNK).replace(
        '  markReloadAttempted()\n  reload()',
        '  markReloadAttempted()\n  telemetry.count("stale-chunk")\n  reload()',
      )
      expect(edited).not.toBe(released(STALE_CHUNK))
      fixture.write(STALE_CHUNK, edited)

      const report = await upgrade()

      // All or nothing: a boolean markReloadAttempted() nobody checks is worse than none.
      expect(fixture.read(STALE_CHUNK)).toBe(edited)
      expect(texts(report)).toEqual([expect.stringContaining('return a boolean')])
    })

    it('warns when the file no longer exports what the error boundary imports', async () => {
      seed([STALE_CHUNK])
      await upgrade()
      fixture.write(
        STALE_CHUNK,
        fixture
          .read(STALE_CHUNK)
          .replace('export function isStaleChunkError', 'function isStaleChunkError'),
      )

      const again = await upgrade({}, { version: '1.1.0-alpha.1' })

      expect(texts(again)).toEqual([expect.stringContaining('no longer exports isStaleChunkError')])
    })
  })

  describe('auth/pages/login.vue', () => {
    it('adds the expired-session notice to an unedited page', async () => {
      seed([LOGIN])

      const report = await upgrade()

      const result = fixture.read(LOGIN)
      expect(hash(result)).toBe(BECOMES[LOGIN])
      expect(result).toContain("const sessionExpired = computed(() => reason.value === 'expired')")
      expect(result).toContain("{{ t('auth_session_expired') }}")
      expect(report.notes).toEqual([])
    })

    it('adds it to a page the project restyled elsewhere', async () => {
      seed([LOGIN])
      fixture.write(LOGIN, released(LOGIN).replace('class="mb-6"', 'class="mb-8"'))

      const report = await upgrade()

      expect(fixture.read(LOGIN)).toContain('class="mb-8"')
      expect(fixture.read(LOGIN)).toContain('v-if="sessionExpired"')
      expect(report.notes).toEqual([])
    })

    it('leaves a page whose error block was rewritten, and describes the notice', async () => {
      seed([LOGIN])
      const edited = released(LOGIN).replace(
        '        v-if="error"\n        class="border-danger-200',
        '        v-if="error"\n        role="alert"\n        class="border-danger-200',
      )
      expect(edited).not.toBe(released(LOGIN))
      fixture.write(LOGIN, edited)

      const report = await upgrade()

      // Not half of it: the computed without the element would be dead code.
      expect(fixture.read(LOGIN)).toBe(edited)
      expect(texts(report)).toEqual([
        expect.stringMatching(/useRouteQueryParam\('reason'\).*auth_session_expired/s),
      ])
    })

    it('is quiet for a page that shows the message its own way', async () => {
      seed([LOGIN])
      fixture.write(
        LOGIN,
        released(LOGIN).replace(
          '        v-if="error"\n',
          '        v-if="error || expired"\n        :title="t(\'auth_session_expired\')"\n',
        ),
      )

      const report = await upgrade()

      expect(report.notes).toEqual([])
      expect(changed(report)).toEqual([])
    })

    // The shipped lines are all still there, so the blocks match. What the
    // project wrote beside them is what makes the insertion a second declaration.
    it.each([
      [
        'reads ?reason= for a message of its own',
        "const reason = useRouteQueryParam('reason')\n" +
          "const sessionExpired = computed(() => reason.value === 'expired')\n",
      ],
      ['declares a `reason` for something else', "const reason = ref('')\n"],
      [
        'takes `sessionExpired` from a composable',
        'const { sessionExpired } = useSessionState()\n',
      ],
    ])('leaves a page that %s, and describes the notice', async (_what, declarations) => {
      seed([LOGIN])
      const own = released(LOGIN).replace(
        'const notifications = useNotificationStore()\n',
        `const notifications = useNotificationStore()\n${declarations}`,
      )
      expect(own).not.toBe(released(LOGIN))
      fixture.write(LOGIN, own)

      const report = await upgrade()

      // Not a second `const reason`: the file would no longer compile.
      expect(fixture.read(LOGIN)).toBe(own)
      expect(changed(report)).toEqual([])
      expect(texts(report)).toEqual([
        expect.stringMatching(/useRouteQueryParam\('reason'\).*auth_session_expired/s),
      ])
    })
  })

  describe('pages that ship in a production bundle', () => {
    const PAGES = [AUTH_RBAC, DEEP_DIVE, VERCEL, FORMS]

    it('stops quoting the demo account and the demo stores', async () => {
      seed([...PAGES, FORMS_SPEC])
      for (const rel of PAGES) {
        expect(
          DEMO_LITERALS.some((literal) => released(rel).includes(literal)),
          rel,
        ).toBe(true)
      }

      const report = await upgrade()

      for (const rel of [...PAGES, FORMS_SPEC]) {
        expect(hash(fixture.read(rel)), rel).toBe(BECOMES[rel])
      }
      // The spec is not in any bundle; it only has to expect what the page now shows.
      for (const rel of PAGES) {
        for (const literal of DEMO_LITERALS) expect(fixture.read(rel), rel).not.toContain(literal)
      }
      expect(fixture.read(FORMS_SPEC)).not.toContain("toHaveValue('demo@vuestrata.dev')")
      expect(report.notes).toEqual([])
    })

    it('fixes the lines that are still as shipped, and names the one that is not', async () => {
      seed(PAGES)
      // The credentials table reworded; the Persistence paragraph left as it was.
      const edited = released(AUTH_RBAC).replace(
        '| Email                | Password   | Role          |',
        '| Login                | Password   | Role          |',
      )
      expect(edited).not.toBe(released(AUTH_RBAC))
      fixture.write(AUTH_RBAC, edited)

      const report = await upgrade()

      const result = fixture.read(AUTH_RBAC)
      expect(result).toContain('| `demo@vuestrata.dev` | `demo1234` | `super_admin` |')
      expect(result).not.toContain('vuestrata-demo-auth')
      expect(texts(report)).toHaveLength(1)
      expect(texts(report)[0]).toContain(`${AUTH_RBAC} ("demo@vuestrata.dev")`)
      expect(texts(report)[0]).toContain('verify-bundle.mjs --mode=production')
      // The other three were fixed, and are not named.
      for (const rel of [DEEP_DIVE, VERCEL, FORMS]) expect(texts(report)[0]).not.toContain(rel)
    })

    it('makes the forms spec follow the page, and leaves it when the page was left', async () => {
      seed([FORMS, FORMS_SPEC])
      const edited = released(FORMS).replace(
        "  email: 'demo@vuestrata.dev',",
        "  email: 'demo@vuestrata.dev', // shown in the demo",
      )
      fixture.write(FORMS, edited)

      const report = await upgrade()

      expect(fixture.read(FORMS)).toBe(edited)
      // The spec asserts what the page pre-fills, which has not changed.
      expect(fixture.read(FORMS_SPEC)).toBe(released(FORMS_SPEC))
      expect(texts(report)).toEqual([expect.stringContaining(`${FORMS} ("demo@vuestrata.dev")`)])
    })

    it('rewords a line the page quotes twice, both in one upgrade', async () => {
      seed([DEEP_DIVE])
      const line = "- Cross-tab sync via `BroadcastChannel('vuestrata-demo-auth')`.\n"
      expect(released(DEEP_DIVE)).toContain(line)
      fixture.write(DEEP_DIVE, `${released(DEEP_DIVE)}\n## Summary\n\n${line}`)

      const report = await upgrade()

      expect(fixture.read(DEEP_DIVE)).not.toContain('vuestrata-demo-auth')
      expect(fixture.read(DEEP_DIVE).split('named by `DEMO_CHANNEL_NAME`')).toHaveLength(3)
      expect(report.notes).toEqual([])
    })

    it('says nothing in a project that ejected the docs and the showcase', async () => {
      seed([PACKAGE])

      const report = await upgrade()

      expect(report.notes).toEqual([])
    })
  })

  describe('tests that asserted the 1.0 behaviour', () => {
    it('rewrites the assertions of every unedited one', async () => {
      seed(PINNED_TESTS)

      const report = await upgrade()

      for (const rel of PINNED_TESTS) expect(hash(fixture.read(rel)), rel).toBe(BECOMES[rel])
      expect(changed(report).sort((a, b) => a.localeCompare(b))).toEqual(
        [...PINNED_TESTS].sort((a, b) => a.localeCompare(b)),
      )
      expect(report.notes).toEqual([])
    })

    it('leaves the ones the project rewrote, in one note that says what changed in each', async () => {
      seed(PINNED_TESTS)
      const stores = 'test/stores.test.ts'
      const pkce = 'test/unit/auth/oauth-pkce.test.ts'
      const editedStores = released(stores).replace(
        "role: 'member' }, 'tok')\n    expect(store.userPermissions).toEqual([])",
        "role: 'member' }, 'tok')\n    expect(store.userPermissions).toHaveLength(0)",
      )
      const editedPkce = released(pkce).replace(
        "toHaveBeenCalledWith('/auth/token', {\n      method: 'POST',",
        "toHaveBeenCalledWith('/auth/token', {\n      method: 'POST', // ours",
      )
      expect(editedStores).not.toBe(released(stores))
      expect(editedPkce).not.toBe(released(pkce))
      fixture.write(stores, editedStores)
      fixture.write(pkce, editedPkce)

      const report = await upgrade()

      expect(fixture.read(stores)).toBe(editedStores)
      expect(fixture.read(pkce)).toBe(editedPkce)
      expect(texts(report)).toHaveLength(1)
      expect(texts(report)[0]).toContain(`${stores} and ${pkce} still assert what 1.0 did`)
      expect(texts(report)[0]).toContain('userPermissions is what the role grants')
      expect(texts(report)[0]).toContain('skipAuthRefresh: true')
      // The six it did rewrite are not in the note.
      expect(texts(report)[0]).not.toContain('use-rbac.test.ts')
    })

    it('does not touch a test file a second time', async () => {
      seed(PINNED_TESTS)
      await upgrade()

      const again = await upgrade({}, { version: '1.1.0-alpha.1' })

      expect(changed(again)).toEqual([])
      expect(again.notes).toEqual([])
    })

    describe('in a file that already has what the new assertions bring', () => {
      const STORES_TEST = 'test/stores.test.ts'
      const USE_RBAC_TEST = 'test/unit/composables/use-rbac.test.ts'
      const SURFACE_TEST = 'test/unit/architecture/public-surface.test.ts'
      const DRIFT_TEST = 'test/unit/architecture/registry-drift.test.ts'
      const CONTRACT_TEST = 'test/unit/architecture/module-contract.test.ts'

      it('does not import getRolePermissions a second time', async () => {
        seed([STORES_TEST])
        const line = "import { getRolePermissions } from '~/lib/rbac'\n"
        // The project tests the role table in this file too.
        const own = released(STORES_TEST).replace(
          "import { useAppStore } from '@/stores/app'\n",
          `import { useAppStore } from '@/stores/app'\n${line}`,
        )
        expect(own).not.toBe(released(STORES_TEST))
        fixture.write(STORES_TEST, own)

        const report = await upgrade()

        const result = fixture.read(STORES_TEST)
        expect(result.split(line)).toHaveLength(2)
        // The assertions were still rewritten: only the import was already there.
        expect(result).toContain('userPermissions derives from the role')
        expect(report.notes).toEqual([])
      })

      it('leaves a use-rbac test that renamed the helper the new test calls', async () => {
        seed([USE_RBAC_TEST])
        const own = released(USE_RBAC_TEST).replaceAll('setupAuth', 'signIn')
        expect(own).not.toBe(released(USE_RBAC_TEST))
        fixture.write(USE_RBAC_TEST, own)

        const report = await upgrade()

        // Rewritten, it would call a `setupAuth` that is not there.
        expect(fixture.read(USE_RBAC_TEST)).toBe(own)
        expect(texts(report)).toEqual([
          expect.stringContaining(`${USE_RBAC_TEST} still asserts what 1.0 did`),
        ])
      })

      it('leaves a public-surface test that already declares MAINTAINER', async () => {
        seed([SURFACE_TEST])
        const own = released(SURFACE_TEST).replace(
          'const ROOT = process.cwd()\n',
          "const MAINTAINER = 'acme-platform'\nconst ROOT = process.cwd()\n",
        )
        expect(own).not.toBe(released(SURFACE_TEST))
        fixture.write(SURFACE_TEST, own)

        const report = await upgrade()

        expect(fixture.read(SURFACE_TEST)).toBe(own)
        expect(texts(report)).toEqual([expect.stringContaining('VUESTRATA_MAINTAINER=1')])
      })

      it.each([
        [DRIFT_TEST, 'read each catalog with its overrides merged on top'],
        [CONTRACT_TEST, 'count its keys with those of the catalog'],
      ])('leaves %s when it already binds enOverrides', async (rel, change) => {
        seed([rel])
        const own = released(rel).replace(
          "import enShell from '@/locales/en.json'\n",
          "import enShell from '@/locales/en.json'\nimport enOverrides from '../../fixtures/overrides'\n",
        )
        expect(own).not.toBe(released(rel))
        fixture.write(rel, own)

        const report = await upgrade()

        expect(fixture.read(rel)).toBe(own)
        expect(texts(report)).toEqual([expect.stringContaining(change)])
      })
    })

    describe('for a file the project edited and keeps', () => {
      const STORE = 'src/modules/app/stores/auth.ts'
      const STORES_TEST = 'test/stores.test.ts'
      const BASE = 'src/modules/auth/adapters/base.ts'
      const ADAPTER_TESTS = ['test/unit/auth/adapters.test.ts', 'test/unit/auth/oauth-pkce.test.ts']
      /** What this release ships at those paths. */
      const SHIPPED_FILES = { [STORE]: inRepo(STORE), [BASE]: inRepo(BASE) }
      const waitingNotes = (report: Report) =>
        texts(report).filter((text) => /which you edited and keep/.test(text))

      it('leaves the test that is still right about that file, and says when it follows', async () => {
        seed([...PINNED_TESTS, STORE, BASE])
        // The project's own line in the store: it stays, with what 1.0 did.
        const edited = `// ACME: reviewed by security.\n${released(STORE)}`
        fixture.write(STORE, edited)

        const report = await upgrade(SHIPPED_FILES)

        expect(fixture.read(STORE)).toBe(edited)
        // Rewritten, the test would assert a userPermissions this store does not compute.
        expect(fixture.read(STORES_TEST)).toBe(released(STORES_TEST))
        expect(waitingNotes(report)).toHaveLength(1)
        expect(waitingNotes(report)[0]).toContain(`${STORES_TEST} was left as it is`)
        expect(waitingNotes(report)[0]).toContain(STORE)
        expect(waitingNotes(report)[0]).toMatch(/run `vuestrata upgrade` again/)
        // The other subjects were replaced, so their tests moved with them.
        for (const rel of ADAPTER_TESTS) expect(hash(fixture.read(rel)), rel).toBe(BECOMES[rel])
        expect(waitingNotes(report)[0]).not.toContain('adapters.test.ts')
      })

      it('rewrites it on the upgrade after the project merged the new file', async () => {
        seed([...PINNED_TESTS, STORE, BASE])
        fixture.write(STORE, `// ACME: reviewed by security.\n${released(STORE)}`)
        await upgrade(SHIPPED_FILES)
        expect(fixture.read(STORES_TEST)).toBe(released(STORES_TEST))

        // Merged by hand: the release's store, with the project's line kept.
        fixture.write(STORE, `// ACME: reviewed by security.\n${inRepo(STORE)}`)
        const again = await upgrade(SHIPPED_FILES, { version: '1.1.0-alpha.1' })

        expect(hash(fixture.read(STORES_TEST))).toBe(BECOMES[STORES_TEST])
        expect(waitingNotes(again)).toEqual([])
      })

      it('keeps both adapter tests while the shared endpoints file is the edited one', async () => {
        seed([...PINNED_TESTS, STORE, BASE])
        fixture.write(BASE, `// ACME: one more endpoint below.\n${released(BASE)}`)

        const report = await upgrade(SHIPPED_FILES)

        for (const rel of ADAPTER_TESTS) expect(fixture.read(rel), rel).toBe(released(rel))
        expect(hash(fixture.read(STORES_TEST))).toBe(BECOMES[STORES_TEST])
        expect(waitingNotes(report)).toHaveLength(1)
        expect(waitingNotes(report)[0]).toContain(
          `${ADAPTER_TESTS.join(' and ')} were left as they are`,
        )
        expect(waitingNotes(report)[0]).toContain(`they test ${BASE}`)
      })
    })
  })

  describe('vite.config.ts', () => {
    const VITE = 'vite.config.ts'
    const SHIPPED_LINES = "    setupFiles: ['test/setup.ts'],\n\n    coverage: {\n"

    it('gives an unedited test block the timeout and the worker cap', async () => {
      seed([VITE])
      expect(lf(released(VITE))).toContain(SHIPPED_LINES)

      const report = await upgrade()

      const result = lf(fixture.read(VITE))
      expect(result).toContain('    testTimeout: 15_000,\n')
      expect(result).toContain("    ...(process.env.CI ? {} : { maxWorkers: '50%' }),\n")
      // With the env plugin moved out by the promotions, the file this release ships.
      expect(hash(result)).toBe(BECOMES[VITE])
      expect(report.notes).toEqual([])
      expect(fixture.exists(incoming(VITE))).toBe(false)
    })

    it('keeps the line endings the file had', async () => {
      seed([VITE])
      fixture.write(VITE, lf(released(VITE)).replaceAll('\n', '\r\n'))

      await upgrade()

      const result = fixture.read(VITE)
      expect(result).not.toMatch(/[^\r]\n/)
      expect(hash(lf(result))).toBe(BECOMES[VITE])
    })

    it('leaves a project that chose its own timeout or worker count, without a word', async () => {
      for (const setting of ['testTimeout: 30_000', 'maxWorkers: 2']) {
        seed([VITE])
        const own = lf(released(VITE)).replace(
          SHIPPED_LINES,
          `    setupFiles: ['test/setup.ts'],\n\n    ${setting},\n\n    coverage: {\n`,
        )
        fixture.write(VITE, own)

        const report = await upgrade()

        const result = lf(fixture.read(VITE))
        expect(result, setting).toContain(`    ${setting},\n`)
        expect(result, setting).not.toContain('15_000')
        expect(result, setting).not.toContain("maxWorkers: '50%'")
        expect(texts(report).filter((text) => /testTimeout|maxWorkers/.test(text))).toEqual([])
      }
    })

    it('leaves a test block that is no longer the shipped one, without a word', async () => {
      seed([VITE])
      const reshaped = lf(released(VITE)).replace(
        SHIPPED_LINES,
        "    setupFiles: ['test/setup.ts', 'test/setup.acme.ts'],\n\n    coverage: {\n",
      )
      fixture.write(VITE, reshaped)

      const report = await upgrade()

      expect(lf(fixture.read(VITE))).not.toContain('testTimeout')
      expect(lf(fixture.read(VITE))).toContain("'test/setup.acme.ts'")
      expect(texts(report).filter((text) => /testTimeout|maxWorkers/.test(text))).toEqual([])
      expect(fixture.exists(incoming(VITE))).toBe(false)
    })

    it('does nothing the second time', async () => {
      seed([VITE])
      await upgrade()
      const once = fixture.read(VITE)

      const again = await upgrade({}, { version: '1.1.0-alpha.1' })

      expect(fixture.read(VITE)).toBe(once)
      expect(changed(again)).toEqual([])
      expect(again.notes).toEqual([])
    })

    it('is named once in the report, though three steps change it', async () => {
      seed([VITE])

      const report = await upgrade()

      expect(changed(report)).toEqual([VITE])
    })

    it('reads a setting, not a comment that mentions one', async () => {
      seed([VITE])
      // The words, and no option: this project has chosen nothing.
      fixture.write(
        VITE,
        lf(released(VITE)).replace(
          SHIPPED_LINES,
          "    // TODO: raise testTimeout and cap maxWorkers on the build agents\n    setupFiles: ['test/setup.ts'],\n\n    coverage: {\n",
        ),
      )

      await upgrade()

      const result = lf(fixture.read(VITE))
      expect(result).toContain('    testTimeout: 15_000,\n')
      expect(result).toContain("    ...(process.env.CI ? {} : { maxWorkers: '50%' }),\n")
    })

    describe('and the copies an upgrade leaves in .vuestrata/', () => {
      const ENTRY = "      '.vuestrata/**',\n"
      const ignoreNotes = (report: Report) =>
        texts(report).filter((text) => text.includes("'.vuestrata/**'"))

      it('keeps the linter and the formatter out of them', async () => {
        seed([VITE])
        expect(released(VITE)).not.toContain('.vuestrata')

        const report = await upgrade()

        const result = lf(fixture.read(VITE))
        // Once in `lint.ignorePatterns`, once in `fmt.ignorePatterns`.
        expect(result.split(ENTRY)).toHaveLength(3)
        const lint = result.slice(result.indexOf('  lint: {'), result.indexOf('  fmt: {'))
        const fmt = result.slice(result.indexOf('  fmt: {'), result.indexOf('  staged: {'))
        expect(lint).toContain(ENTRY)
        expect(fmt).toContain(ENTRY)
        expect(ignoreNotes(report)).toEqual([])
      })

      it('adds it to the linter alone where the formatter list was changed', async () => {
        seed([VITE])
        fixture.write(
          VITE,
          lf(released(VITE)).replace(
            "    ignorePatterns: [\n      '.agents/**',\n      '*.d.ts',\n",
            "    ignorePatterns: [\n      'legacy/**',\n      '.agents/**',\n      '*.d.ts',\n",
          ),
        )

        const report = await upgrade()

        const result = lf(fixture.read(VITE))
        expect(result.split(ENTRY)).toHaveLength(2)
        expect(result).toContain("'legacy/**'")
        expect(ignoreNotes(report)).toEqual([])
      })

      it('says what to add where the linter list is no longer the shipped one', async () => {
        seed([VITE])
        const own = lf(released(VITE)).replace(
          "      'packages/cli/payload/**',\n      '.agents/**',\n",
          "      'packages/cli/payload/**',\n      'legacy/**',\n      '.agents/**',\n",
        )
        expect(own).not.toBe(lf(released(VITE)))
        fixture.write(VITE, own)

        const report = await upgrade()

        expect(lf(fixture.read(VITE))).not.toContain('.vuestrata')
        expect(ignoreNotes(report)).toHaveLength(1)
        expect(ignoreNotes(report)[0]).toMatch(/lint\.ignorePatterns/)
        expect(fixture.exists(incoming(VITE))).toBe(false)
      })

      it('has nothing to say to a project that already ignores the directory', async () => {
        seed([VITE])
        fixture.write(
          VITE,
          lf(released(VITE)).replace(
            "      'dist/**',\n",
            "      'dist/**',\n      '.vuestrata/',\n",
          ),
        )

        const report = await upgrade()

        expect(lf(fixture.read(VITE)).split(ENTRY)).toHaveLength(1)
        expect(ignoreNotes(report)).toEqual([])
      })

      it('is not put off by a comment that mentions the directory', async () => {
        seed([VITE])
        fixture.write(
          VITE,
          lf(released(VITE)).replace(
            "      'dist/**',\n",
            "      // .vuestrata/ is where upgrades leave the files they would not overwrite\n      'dist/**',\n",
          ),
        )

        const report = await upgrade()

        // The comment ignores nothing, so the entry is still added.
        expect(lf(fixture.read(VITE)).split(ENTRY)).toHaveLength(3)
        expect(ignoreNotes(report)).toEqual([])
      })
    })

    describe('and the vendor chunks', () => {
      const FUNCTION = '        manualChunks(id) {\n'
      const GROUPS = '        codeSplitting: {\n          groups: [\n'
      const CHARTS_GROUP = [
        '            {',
        "              name: 'charts-vendor',",
        '              test: /node_modules[\\\\/](?:echarts|vue-echarts|zrender)[\\\\/]/,',
        '              priority: 10,',
        '            },',
        '',
      ].join('\n')
      const chunkNotes = (report: Report) =>
        texts(report).filter((text) => text.includes('codeSplitting'))

      it('replaces the function both releases shipped with groups that have an order', async () => {
        for (const tag of TAGS) {
          const shipped = atTag(tag, VITE)!
          expect(lf(shipped), tag).toContain(FUNCTION)
          fixture.write(VITE, shipped)
          writeLock(fixture.project, emptyLock(FROM))

          const report = await upgrade()

          const result = lf(fixture.read(VITE))
          expect(result, tag).not.toContain(FUNCTION)
          expect(result, tag).toContain(GROUPS)
          // The patterns are written with backslashes, which a careless
          // replacement halves or doubles.
          expect(result, tag).toContain(CHARTS_GROUP)
          // The framework is claimed ahead of the chart group, which is the fix.
          expect(result.indexOf("name: 'vue-vendor'"), tag).toBeLessThan(
            result.indexOf("name: 'charts-vendor'"),
          )
          expect(hash(result), tag).toBe(BECOMES[VITE])
          expect(chunkNotes(report), tag).toEqual([])
        }
      })

      // Four codemods meet in this file: the env plugin import, the test block,
      // the ignore lists and the chunks. Together they must write the config a
      // new project gets, or an upgraded project and a new one differ for ever
      // in a file no later release can reach. Only the template is held to
      // that: a project's vite.config.ts is its own.
      it.runIf(MAINTAINER)(
        'brings an unedited config to the one this repository ships',
        async () => {
          seed([VITE])

          await upgrade()

          expect(lf(fixture.read(VITE))).toBe(lf(inRepo(VITE)))
          expect(hash(inRepo(VITE))).toBe(BECOMES[VITE])
        },
      )

      it('leaves a function the project changed, and gives the groups to write', async () => {
        seed([VITE])
        const own = lf(released(VITE)).replace(
          "          if (id.includes('node_modules/msw/')) {\n",
          "          if (id.includes('node_modules/leaflet/')) return 'maps-vendor'\n" +
            "          if (id.includes('node_modules/msw/')) {\n",
        )
        expect(own).not.toBe(lf(released(VITE)))
        fixture.write(VITE, own)

        const report = await upgrade()

        const result = lf(fixture.read(VITE))
        expect(result).toContain(FUNCTION)
        expect(result).toContain("return 'maps-vendor'")
        expect(result).not.toContain('codeSplitting')
        // The other three still found their lines in the same file.
        expect(result).toContain('    testTimeout: 15_000,\n')
        expect(result).toContain("      '.vuestrata/**',\n")
        expect(result).toContain("from './scripts/vite/vuestrata-plugin.mjs'")

        expect(chunkNotes(report)).toHaveLength(1)
        const [note] = chunkNotes(report)
        expect(note).toMatch(/not the one 1\.0\.1-alpha\.6 shipped/)
        expect(note).toContain('verify-bundle.mjs')
        // Exact enough to paste: every group, with the pattern as it is written.
        for (const name of ['vue', 'ui', 'data', 'charts', 'docs', 'msw']) {
          expect(note, name).toContain(`{ name: '${name}-vendor', test: /node_modules[\\\\/]`)
        }
        expect(note).toContain(
          "{ name: 'charts-vendor', test: /node_modules[\\\\/](?:echarts|vue-echarts|zrender)[\\\\/]/, priority: 10 }",
        )
        expect(fixture.exists(incoming(VITE))).toBe(false)
      })

      it('says it again on the next upgrade, until the function is gone', async () => {
        seed([VITE])
        fixture.write(
          VITE,
          lf(released(VITE)).replace('// Charting — large;', '// Charts — large;'),
        )
        await upgrade()

        const again = await upgrade({}, { version: '1.1.0-alpha.1' })

        expect(chunkNotes(again)).toHaveLength(1)
        expect(changed(again)).toEqual([])
      })

      // A declaration that may already exist is never added a second time:
      // with both in the file, rolldown ignores the function, and the project
      // has made the change already.
      it.each([
        [
          'codeSplitting',
          "        codeSplitting: { groups: [{ name: 'vendor', test: /node_modules/ }] },\n",
        ],
        [
          'advancedChunks',
          "        advancedChunks: { groups: [{ name: 'vendor', test: /node_modules/ }] },\n",
        ],
      ])('leaves a config that already declares %s, without a word', async (_, declared) => {
        seed([VITE])
        const own = lf(released(VITE)).replace(FUNCTION, declared + FUNCTION)
        expect(own).not.toBe(lf(released(VITE)))
        fixture.write(VITE, own)

        const report = await upgrade()

        const result = lf(fixture.read(VITE))
        expect(result).toContain(declared + FUNCTION)
        expect(result.split('codeSplitting')).toHaveLength(
          declared.includes('codeSplitting') ? 2 : 1,
        )
        expect(chunkNotes(report)).toEqual([])
      })

      it('has nothing to say to a config that no longer names its chunks', async () => {
        seed([VITE])
        const own = lf(released(VITE))
        const start = own.indexOf(FUNCTION)
        const end = own.indexOf('        },\n', start) + '        },\n'.length
        fixture.write(VITE, own.slice(0, start) + own.slice(end))

        const report = await upgrade()

        expect(lf(fixture.read(VITE))).not.toContain('codeSplitting')
        expect(chunkNotes(report)).toEqual([])
      })
    })
  })

  describe('the three merged files', () => {
    const BARREL = 'src/modules/app/components/ui/index.ts'

    it('accepts a barrel the project generated a component into, and keeps the entry', async () => {
      const entry = "export { default as UiTag } from './UiTag.vue'"
      fixture.write(
        BARREL,
        released(BARREL).replace(
          '// app:ui-components-start\n',
          `// app:ui-components-start\n${entry}\n`,
        ),
      )
      expect(fixture.read(BARREL)).toContain(entry)
      // The 1.0 lock: managed, with the hash of the whole file as it shipped.
      writeLock(fixture.project, {
        ...emptyLock(FROM),
        files: {
          [BARREL]: { class: 'managed', hash: hash(released(BARREL)), since: '1.0.1-alpha.5' },
        },
      })

      const report = await upgrade({}, { merged: { [BARREL]: inRepo(BARREL) } })

      expect(report.adopted).toContainEqual({
        rel: BARREL,
        class: 'merged',
        reason: 'reclassified',
      })
      expect(report.incoming).toEqual([])
      expect(report.notes).toEqual([])
      expect(fixture.read(BARREL)).toContain(entry)
      expect(readLock(fixture.project).files[BARREL]).toMatchObject({ class: 'merged' })
    })
  })

  describe('the container and CI files', () => {
    const FAMILY = Object.keys(SHIPPED as Record<string, string[]>)
    const GENERATORS = { [HEADERS]: inRepo(HEADERS), [SYNC]: inRepo(SYNC) }

    function seedDeployment() {
      seed([...FAMILY, HEADERS, SYNC])
    }

    it('replaces every unedited one, and the only note is the reminder to regenerate', async () => {
      seedDeployment()

      const report = await upgrade(GENERATORS)

      for (const rel of FAMILY) expect(fixture.read(rel), rel).toBe(shippedCopy(rel))
      expect(report.incoming).toEqual([])
      expect(texts(report)).toEqual([expect.stringMatching(REMINDER)])
    })

    it('writes each in the line endings it had', async () => {
      seedDeployment()
      fixture.write('Dockerfile', released('Dockerfile').replaceAll('\n', '\r\n'))

      await upgrade(GENERATORS)

      expect(fixture.read('Dockerfile')).toBe(shippedCopy('Dockerfile').replaceAll('\n', '\r\n'))
    })

    it('leaves an edited Dockerfile, offers the new one, and says it all in one note', async () => {
      seedDeployment()
      const edited = `${released('Dockerfile')}\nLABEL org.opencontainers.image.vendor="Acme"\n`
      fixture.write('Dockerfile', edited)

      const report = await upgrade(GENERATORS)

      expect(fixture.read('Dockerfile')).toBe(edited)
      expect(fixture.read(incoming('Dockerfile'))).toBe(shippedCopy('Dockerfile'))
      // The rest of the family is judged file by file.
      for (const rel of FAMILY.filter((file) => file !== 'Dockerfile')) {
        expect(fixture.read(rel), rel).toBe(shippedCopy(rel))
      }
      // One note: what changed in the Dockerfile, ending on the reminder that
      // would otherwise have been a second note about the same image.
      expect(texts(report)).toHaveLength(1)
      expect(texts(report)[0]).toMatch(/^Dockerfile differs from what 1\.0\.1-alpha\.6 shipped/)
      expect(texts(report)[0]).toContain('arm64')
      expect(texts(report)[0]).toContain('/healthz')
      expect(texts(report)[0]).toContain('run `vpr security:headers`')
      expect(texts(report)[0]).not.toContain('docker-compose.yml')
    })

    it('says what changed in an edited workflow', async () => {
      seedDeployment()
      const edited = released(CI).replace("NODE_VERSION: '22'", "NODE_VERSION: '22' # ours")
      expect(edited).not.toBe(released(CI))
      fixture.write(CI, edited)

      const report = await upgrade(GENERATORS)

      expect(fixture.read(CI)).toBe(edited)
      expect(fixture.read(incoming(CI))).toBe(shippedCopy(CI))
      const [note] = texts(report)
      expect(texts(report)).toHaveLength(1)
      for (const change of ['vpr lint:maintainer', 'cli-roundtrip', 'fetch-depth: 0', 'arm64']) {
        expect(note, change).toContain(change)
      }
    })

    it('holds the Dockerfile and the spec back while the header generators are, and says why', async () => {
      seedDeployment()
      fixture.write(HEADERS, `${released(HEADERS)}\n// our CSP\n`)

      const report = await upgrade(GENERATORS)

      // Unedited, and still not replaced. The spec asserts what the new nginx
      // config does, and the Dockerfile copies docker/runtime/ into the image,
      // which only the new generators write: beside the 1.0 ones it does not
      // build, where the 1.0 Dockerfile still builds the 1.0 image.
      const WAITING = ['Dockerfile', SPEC]
      for (const rel of WAITING) {
        expect(fixture.read(rel), rel).toBe(released(rel))
        expect(fixture.read(incoming(rel)), rel).toBe(shippedCopy(rel))
      }
      for (const rel of FAMILY.filter((file) => !WAITING.includes(file))) {
        expect(fixture.read(rel), rel).toBe(shippedCopy(rel))
      }

      const family = texts(report).filter((text) => text.includes(SPEC))
      expect(family).toHaveLength(1)
      expect(family[0]).toContain(
        `Dockerfile and ${SPEC} were not replaced although yours are unedited`,
      )
      expect(family[0]).toContain('docker/runtime/')
      expect(family[0]).toContain('run `vuestrata upgrade` again')
      expect(family[0]).toContain('builds the 1.0 image')
      expect(family[0]).toContain('scripts/security/headers.mjs')
      // Nothing was regenerated from, so nothing says to regenerate.
      expect(texts(report).join('\n')).not.toMatch(REMINDER)
      expect(texts(report).filter((text) => /one unit/.test(text))).toHaveLength(1)
    })

    it('says it of the spec alone when the Dockerfile was edited', async () => {
      seedDeployment()
      fixture.write(HEADERS, `${released(HEADERS)}\n// our CSP\n`)
      fixture.write('Dockerfile', `${released('Dockerfile')}\n# ours\n`)

      const [note] = texts(await upgrade(GENERATORS)).filter((text) => text.includes(SPEC))

      expect(note).toContain('Dockerfile differs from what 1.0.1-alpha.6 shipped')
      expect(note).toContain(`${SPEC} was not replaced although yours is unedited`)
      expect(note).not.toContain('builds the 1.0 image')
    })

    it('replaces both on the upgrade after the generators were merged', async () => {
      seedDeployment()
      fixture.write(HEADERS, `${released(HEADERS)}\n// our CSP\n`)
      await upgrade(GENERATORS)

      // The project takes the incoming generators.
      fixture.write(HEADERS, inRepo(HEADERS))
      fixture.write(SYNC, inRepo(SYNC))
      const again = await upgrade(GENERATORS, { version: '1.1.0-alpha.1' })

      expect(fixture.read('Dockerfile')).toBe(shippedCopy('Dockerfile'))
      expect(fixture.read(SPEC)).toBe(shippedCopy(SPEC))
      expect(texts(again).filter((text) => text.includes(SPEC))).toEqual([])
    })

    it('is quiet about a file the project merged by hand', async () => {
      seedDeployment()
      const merged = `${shippedCopy('Dockerfile')}\nLABEL org.opencontainers.image.vendor="Acme"\n`
      fixture.write('Dockerfile', merged)

      const report = await upgrade(GENERATORS)

      expect(fixture.read('Dockerfile')).toBe(merged)
      expect(fixture.exists(incoming('Dockerfile'))).toBe(false)
      expect(texts(report)).toEqual([expect.stringMatching(REMINDER)])
    })

    it('does nothing the second time', async () => {
      seedDeployment()
      await upgrade(GENERATORS)

      const again = await upgrade(GENERATORS, { version: '1.1.0-alpha.1' })

      expect(changed(again)).toEqual([])
      expect(again.incoming).toEqual([])
      expect(again.notes).toEqual([])
    })

    it('skips what a project deleted', async () => {
      seed([HEADERS, SYNC, 'Dockerfile'])

      const report = await upgrade(GENERATORS)

      expect(fixture.exists('docker-compose.yml')).toBe(false)
      expect(fixture.exists(incoming('docker-compose.yml'))).toBe(false)
      expect(texts(report)).toEqual([expect.stringMatching(REMINDER)])
    })
  })

  describe('the note about credentialed requests', () => {
    const ADAPTER = { [JWT]: inRepo(JWT) }
    // How the note opens. The note of a held-back adapter unit names the same
    // header, and is a different note.
    const CORS = /^ACTION MAY BE NEEDED ON YOUR BACKEND/

    const cors = (report: Report) => report.notes.filter((note) => CORS.test(note.text))

    it('names the file that selects the jwt adapter', async () => {
      seed([JWT])
      fixture.write(
        '.env.production',
        'VUESTRATA_AUTH_ADAPTER=jwt\nVUESTRATA_API_URL=https://api.acme.test\n',
      )

      const report = await upgrade(ADAPTER)

      expect(cors(report)).toHaveLength(1)
      const [note] = cors(report)
      expect(note?.rel).toBe(JWT)
      expect(note?.text).toContain('VUESTRATA_AUTH_ADAPTER=jwt (.env.production)')
      expect(note?.text).toContain('Access-Control-Allow-Origin')
      expect(note?.text).toContain('VUESTRATA_SESSION_PERSISTENCE to none, session or local')
    })

    it('is said to a project whose adapter no .env file gives, as a condition', async () => {
      seed([JWT])
      // The example file is documentation, not configuration.
      fixture.write('.env.example', 'VUESTRATA_AUTH_ADAPTER=mock\n')

      const report = await upgrade(ADAPTER)

      expect(cors(report)).toHaveLength(1)
      expect(cors(report)[0]?.text).toContain('This applies if the project builds with')
    })

    it.each([
      ['another adapter', 'VUESTRATA_AUTH_ADAPTER=oauth\n'],
      [
        'another session mode',
        'VUESTRATA_AUTH_ADAPTER=jwt\nVUESTRATA_SESSION_PERSISTENCE=session\n',
      ],
      [
        'a same-origin API',
        'VUESTRATA_AUTH_ADAPTER="jwt"\nVUESTRATA_API_URL=/api # behind the proxy\n',
      ],
    ])('is not said to a project with %s', async (_what, env) => {
      seed([JWT])
      fixture.write('.env.production', env)

      const report = await upgrade(ADAPTER)

      expect(cors(report)).toEqual([])
    })

    // What the docs tell a new project to do, and what the example holds: the
    // mock adapter, a same-origin API and no persistence. All three are about
    // the developer's machine. The deployment is configured in CI.
    it('is said, as a condition, to a project that copied the example to .env.local', async () => {
      seed([JWT])
      const example = released('.env.example')
      for (const line of [
        'VUESTRATA_AUTH_ADAPTER=mock',
        'VUESTRATA_API_URL=/api',
        'VUESTRATA_SESSION_PERSISTENCE=none',
      ]) {
        expect(example).toContain(`\n${line}\n`)
      }
      fixture.write('.env.local', example)

      const report = await upgrade(ADAPTER)

      expect(cors(report)).toHaveLength(1)
      const text = cors(report)[0]?.text
      expect(text).toContain('This applies if the project builds with VUESTRATA_AUTH_ADAPTER=jwt')
      // And why the file it can see did not settle it.
      expect(text).toContain('.env.local sets the adapter for local work')
      expect(text).toContain('Access-Control-Allow-Headers: Authorization, Content-Type')
    })

    it.each(['.env.development', '.env.development.local', '.env.test'])(
      'takes a lone %s that selects the mock adapter as no evidence',
      async (file) => {
        seed([JWT])
        fixture.write(file, 'VUESTRATA_AUTH_ADAPTER=mock\nVUESTRATA_API_URL=/api\n')

        const report = await upgrade(ADAPTER)

        expect(cors(report)).toHaveLength(1)
        expect(cors(report)[0]?.text).toContain('This applies if the project builds with')
        expect(cors(report)[0]?.text).toContain(`${file} sets the adapter for local work`)
      },
    )

    it('is not said when a production file proves a same-origin API, whatever a local one says', async () => {
      seed([JWT])
      fixture.write(
        '.env.local',
        'VUESTRATA_AUTH_ADAPTER=jwt\nVUESTRATA_API_URL=https://staging.acme.test\n',
      )
      fixture.write('.env.production', 'VUESTRATA_AUTH_ADAPTER=jwt\nVUESTRATA_API_URL=/api\n')

      const report = await upgrade(ADAPTER)

      expect(cors(report)).toEqual([])
    })

    it('names the production file that selects jwt and a cross-origin API', async () => {
      seed([JWT])
      // The shared defaults are for development; the production file overrides them.
      fixture.write('.env', 'VUESTRATA_AUTH_ADAPTER=mock\nVUESTRATA_API_URL=/api\n')
      fixture.write(
        '.env.production',
        'VUESTRATA_AUTH_ADAPTER=jwt\nVUESTRATA_API_URL=https://api.acme.test\n',
      )

      const report = await upgrade(ADAPTER)

      expect(cors(report)).toHaveLength(1)
      expect(cors(report)[0]?.text).toContain('VUESTRATA_AUTH_ADAPTER=jwt (.env.production)')
      expect(cors(report)[0]?.text).not.toContain('This applies if')
    })

    it('lets the strongest production file decide', async () => {
      seed([JWT])
      fixture.write('.env.production', 'VUESTRATA_AUTH_ADAPTER=jwt\n')
      fixture.write('.env.production.local', 'VUESTRATA_AUTH_ADAPTER=oauth\n')

      const report = await upgrade(ADAPTER)

      expect(cors(report)).toEqual([])
    })

    it('is not said to a project that kept its own adapter, which still omits credentials', async () => {
      seed([JWT])
      fixture.write(JWT, `${released(JWT)}\n// ours\n`)
      fixture.write('.env.production', 'VUESTRATA_AUTH_ADAPTER=jwt\n')

      const report = await upgrade(ADAPTER)

      expect(fixture.exists(incoming(JWT))).toBe(true)
      expect(cors(report)).toEqual([])
      // It is told in the note of the file it kept: merging is what turns the
      // credentials on.
      expect(texts(report)).toEqual([
        expect.stringMatching(/are one unit.*Access-Control-Allow-Credentials: true/s),
      ])
    })

    it('is not said when base.ts was edited either: the unit is held back whole', async () => {
      const BASE = 'src/modules/auth/adapters/base.ts'
      seed([JWT, BASE])
      fixture.write(BASE, `${released(BASE)}\n// ours\n`)
      fixture.write('.env.production', 'VUESTRATA_AUTH_ADAPTER=jwt\n')

      const report = await upgrade({ ...ADAPTER, [BASE]: inRepo(BASE) })

      // jwt.ts is a release's copy, and it is not replaced: no credentials yet.
      expect(fixture.read(JWT)).toBe(released(JWT))
      expect(cors(report)).toEqual([])
    })

    it('is said once: the next prerelease finds the adapter already replaced', async () => {
      seed([JWT])
      fixture.write('.env.production', 'VUESTRATA_AUTH_ADAPTER=jwt\n')
      const first = await upgrade(ADAPTER)
      expect(cors(first)).toHaveLength(1)
      expect(lf(fixture.read(JWT))).toBe(lf(inRepo(JWT)))

      const again = await upgrade(ADAPTER, { version: '1.1.0-alpha.1' })

      expect(cors(again)).toEqual([])
    })
  })
})

describe.skipIf(!CLI_PRESENT)('the copy of the CLI a project was created with', () => {
  const CLI_PACKAGE = 'packages/cli/package.json'

  async function upgradeWith(pkg: Record<string, unknown>) {
    fixture.write(CLI_PACKAGE, `${JSON.stringify(pkg, null, 2)}\n`)
    writeLock(fixture.project, emptyLock(FROM))
    return upgrade()
  }

  it('is pointed out by the upgrade that crosses into 1.1.0, and only by that one', async () => {
    const report = await upgradeWith({ name: '@vuestrata/cli', version: FROM })

    expect(texts(report)).toEqual([expect.stringContaining(`packages/cli is the copy of this CLI`)])
    expect(texts(report)[0]).toContain(FROM)
    expect(texts(report)[0]).toContain('vuestrata eject')

    // The copy is still there on the next prerelease; saying so again would
    // make every upgrade end on the same paragraph.
    const again = await upgrade({}, { version: '1.1.0-alpha.1' })
    expect(again.notes).toEqual([])
  })

  it.each([
    ['this release', { name: '@vuestrata/cli', version: TO }],
    ['a later one', { name: '@vuestrata/cli', version: '1.2.0' }],
    ['a package of the project', { name: '@acme/cli', version: '0.1.0' }],
  ])('is not when it is %s', async (_what, pkg) => {
    const report = await upgradeWith(pkg)

    expect(report.notes).toEqual([])
  })
})

describe.skipIf(!CLI_PRESENT)('the Node that vp runs locally', () => {
  const PIN_NOTE = '.nvmrc says Node 22'

  async function upgradeWith(files: Record<string, string>) {
    for (const [rel, contents] of Object.entries(files)) fixture.write(rel, contents)
    writeLock(fixture.project, emptyLock(FROM))
    return upgrade()
  }

  // What every project from 1.0 has: the range wins over .nvmrc, and vp picks
  // the newest Node it allows.
  const FROM_10 = { '.nvmrc': '22\n', 'package.json': '{ "engines": { "node": ">=20.0.0" } }\n' }

  it('is pointed out to a project with an .nvmrc that vp does not read, once', async () => {
    const report = await upgradeWith(FROM_10)

    expect(texts(report)).toEqual([expect.stringContaining(PIN_NOTE)])
    expect(texts(report)[0]).toContain('add a .node-version file holding `22`')
    expect(texts(report)[0]).toContain('`vp env pin 22`')
    // The file is the project's: nothing was written for it.
    expect(fixture.exists('.node-version')).toBe(false)

    const again = await upgrade({}, { version: '1.1.0-alpha.1' })
    expect(again.notes).toEqual([])
  })

  it.each([
    ['has a .node-version', { ...FROM_10, '.node-version': '22\n' }],
    [
      'pins a runtime in package.json',
      {
        ...FROM_10,
        'package.json': '{ "devEngines": { "runtime": { "name": "node", "version": "22" } } }\n',
      },
    ],
    ['has no .nvmrc to follow', { 'package.json': FROM_10['package.json'] }],
  ])('is not when the project %s', async (_what, files) => {
    const report = await upgradeWith(files)

    expect(report.notes).toEqual([])
  })
})
