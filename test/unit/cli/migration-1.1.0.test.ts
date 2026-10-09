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
  // After its two codemods: the stale-chunk marker, and the history created
  // with the base path (base-path.mjs). 1.1.0-alpha.0 is unpublished, so the
  // hash follows the second step rather than joining a pristine list.
  'src/modules/app/plugins/router.ts':
    'sha256-b5af2e988f7a886ac265a3b9958786b3875c2791933a8126bcf46b09fa39e8a1',
  'src/modules/app/plugins/stale-chunk.ts':
    'sha256-fcb5e00e0064205e5b64ec5393db49aafd956ae4f98935e4aed3ad1cf57c6f9f',
  'src/modules/app/types/index.ts':
    'sha256-a487526984a308f84ddedb5c53676df71f8e93092d7cb4e8dd41a6109ab63cb7',
  'src/env.d.ts': 'sha256-24cf06a0d56695b2a1add20294423a7f5f770dfaac9dd352bd003bcade520e82',
  // After its two codemods: the expired-session notice, and the demo account
  // shown only with the mock adapter (hybrid-mocks.mjs).
  'src/modules/auth/pages/login.vue':
    'sha256-0e4eb0528703998111b7498c2e1f6e7c7cfa207bec173be475bb86ad8419d3d4',
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
  'vite.config.ts': 'sha256-55d123a498b411840b717b8f2960b3432a9b378b3960f66d907462e1fa8d410f',
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
const I18N = 'src/modules/app/plugins/i18n.ts'
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
const APP_TYPES = 'src/modules/app/types/index.ts'
const ENV_DTS = 'src/env.d.ts'

const HANDLERS = 'src/modules/app/mocks/handlers/index.ts'

const PINNED_TESTS = Object.keys(BECOMES).filter((rel) => rel.startsWith('test/'))

/** The line of the login page that chooses whether to show the demo account, at 1.0. */
const DEMO_HINT_10 = 'const demoAccount = __VUESTRATA_DEMO__ ? DEMO_ACCOUNT : null\n'
const DEMO_HINT_11 =
  "const demoAccount = __VUESTRATA_DEMO__ && runtimeEnv.authAdapter === 'mock' ? DEMO_ACCOUNT : null\n"
const ICON_IMPORT = "import { resolveIcon } from '~/config/icon-provider'\n"
const ENV_IMPORT = "import { runtimeEnv } from '~/lib/config'\n"

/**
 * A 1.0 login page that already chooses the demo hint the way 1.1.0 does, so
 * that a case about another step of that page has only that step left to run.
 */
const pastDemoHint = (page: string) =>
  page.replace(ICON_IMPORT, ICON_IMPORT + ENV_IMPORT).replace(DEMO_HINT_10, DEMO_HINT_11)

/** What the same step adds to the comment above that line. */
const DEMO_HINT_COMMENT = ` *
 * And only where the mock adapter signs in. A demo build can also mock a few
 * modules beside a real backend (\`VUESTRATA_MOCK_ONLY\`), with a real adapter:
 * the demo account does not exist there, and the hint would be a lie.
`

/**
 * A 1.0 login page that already shows the expired-session message, its own
 * way: the other step 1.1.0 has for that page finds nothing to do in it.
 */
const pastExpiredNotice = (page: string) =>
  page.replace(
    '        v-if="error"\n',
    '        v-if="error || expired"\n        :title="t(\'auth_session_expired\')"\n',
  )

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

      // The hook is left as the project wrote it. The other step for this
      // file (the history's base path) still applies: its line is untouched.
      const result = fixture.read(ROUTER)
      expect(result).toContain('  clearStaleChunkMarker()\n  trackPageView()\n})')
      expect(result).not.toContain('START_LOCATION')
      expect(result).toContain('  history: createWebHistory(import.meta.env.BASE_URL),\n')
      // And nothing else moved: without that one line and its comment, the
      // file is the project's.
      expect(
        result.replace(
          /(?: {2}\/\/ .*\n){3} {2}history: createWebHistory\(import\.meta\.env\.BASE_URL\),\n/,
          '  history: createWebHistory(),\n',
        ),
      ).toBe(edited)
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

  describe('plugins/i18n.ts', () => {
    const MERGES = 'isGroup(shipped) && isGroup(value) ? withOverrides(shipped, value) : value'
    const SHALLOW = '  return { ...base, ...overrides }\n'

    it('makes an unedited file merge groups, which is the file this release ships', async () => {
      seed([I18N])
      expect(released(I18N)).toContain(SHALLOW)

      const report = await upgrade()

      const result = fixture.read(I18N)
      expect(result).toContain(MERGES)
      expect(result).not.toContain(SHALLOW)
      expect(result).not.toContain('Shallow by design')
      expect(lf(result)).toBe(lf(inRepo(I18N)))
      expect(changed(report)).toContain(I18N)
      expect(report.notes).toEqual([])
    })

    it('makes the same change in a file the project added a locale to', async () => {
      seed([I18N])
      const edited = released(I18N)
        .replace(
          "import fr from '../locales/fr.json'\n",
          "import de from '../locales/de.json'\nimport fr from '../locales/fr.json'\n",
        )
        .replace(
          '    fr: withOverrides(fr, frOverrides),\n',
          '    de,\n    fr: withOverrides(fr, frOverrides),\n',
        )
      expect(edited).not.toBe(released(I18N))
      fixture.write(I18N, edited)

      const report = await upgrade()

      const result = fixture.read(I18N)
      expect(result).toContain("import de from '../locales/de.json'")
      expect(result).toContain('    de,\n')
      expect(result).toContain(MERGES)
      expect(report.notes).toEqual([])
    })

    it('replaces the function and leaves a comment the project rewrote', async () => {
      seed([I18N])
      const edited = released(I18N).replace(
        ' * Shallow by design: the shell catalog is flat',
        ' * Shallow on purpose (see ADR 12): the shell catalog is flat',
      )
      expect(edited).not.toBe(released(I18N))
      fixture.write(I18N, edited)

      const report = await upgrade()

      const result = fixture.read(I18N)
      expect(result).toContain('Shallow on purpose (see ADR 12)')
      expect(result).toContain(MERGES)
      expect(report.notes).toEqual([])
    })

    it('keeps the line endings the file had', async () => {
      seed([I18N])
      fixture.write(I18N, released(I18N).replaceAll('\n', '\r\n'))

      await upgrade()

      const result = fixture.read(I18N)
      expect(result).not.toMatch(/[^\r]\n/)
      expect(lf(result)).toBe(lf(inRepo(I18N)))
    })

    it('leaves a function the project rewrote, and says what it has to do', async () => {
      seed([I18N])
      const edited = released(I18N).replace(
        SHALLOW,
        '  // Ours: the brand strings win.\n  return { ...base, ...overrides, ...brand }\n',
      )
      expect(edited).not.toBe(released(I18N))
      fixture.write(I18N, edited)

      const report = await upgrade()

      // Not the shipped spread any more, so not recognised as shallow either:
      // nothing is written and nothing is said about a function that is theirs.
      expect(fixture.read(I18N)).toBe(edited)
      expect(report.notes).toEqual([])
    })

    it('says what to write when the shallow merge is there in another shape', async () => {
      seed([I18N])
      const edited = released(I18N).replace(
        'function withOverrides<T extends object>(base: T, overrides: object): T {\n' + SHALLOW,
        'function withOverrides<T extends Messages>(base: T, overrides: Partial<T>): T {\n' +
          SHALLOW,
      )
      expect(edited).not.toBe(released(I18N))
      fixture.write(I18N, edited)

      const report = await upgrade()

      expect(fixture.read(I18N)).toBe(edited)
      expect(texts(report)).toEqual([
        expect.stringMatching(
          /validation.*replaces the whole group.*withOverrides\(base\[key\], value\)/s,
        ),
      ])
      expect(report.notes[0]?.rel).toBe(I18N)
    })

    it('is quiet the second time, and for a file that already merges', async () => {
      seed([I18N])
      await upgrade()
      const once = fixture.read(I18N)

      const report = await upgrade()

      expect(fixture.read(I18N)).toBe(once)
      expect(changed(report)).not.toContain(I18N)
      expect(report.notes).toEqual([])
    })

    it('does not read a shallow merge out of a comment', async () => {
      seed([I18N])
      await upgrade()
      const commented = `${fixture.read(I18N)}\n// was: function withOverrides(base, overrides) { return { ...base, ...overrides } }\n`
      fixture.write(I18N, commented)

      const report = await upgrade()

      expect(fixture.read(I18N)).toBe(commented)
      expect(report.notes).toEqual([])
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
      const edited = pastDemoHint(released(LOGIN)).replace(
        '        v-if="error"\n        class="border-danger-200',
        '        v-if="error"\n        role="alert"\n        class="border-danger-200',
      )
      expect(edited).not.toBe(pastDemoHint(released(LOGIN)))
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
        pastDemoHint(released(LOGIN)).replace(
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
      const own = pastDemoHint(released(LOGIN)).replace(
        'const notifications = useNotificationStore()\n',
        `const notifications = useNotificationStore()\n${declarations}`,
      )
      expect(own).not.toBe(pastDemoHint(released(LOGIN)))
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

  /**
   * `VUESTRATA_MOCK_ONLY` mocks some modules beside a real backend, in a demo
   * build with a real adapter. Two of the project's files assumed that a demo
   * build is always the self-contained demo.
   */
  describe('what VUESTRATA_MOCK_ONLY reads in the project’s files', () => {
    describe('the demo account on the login page', () => {
      it('is shown only with the mock adapter, on an unedited page', async () => {
        seed([LOGIN])

        const report = await upgrade()

        const result = fixture.read(LOGIN)
        expect(result).toContain(ICON_IMPORT + ENV_IMPORT)
        expect(result).toContain(DEMO_HINT_11)
        expect(result).not.toContain(DEMO_HINT_10)
        // The comment above the line says why, as this repository's page does.
        expect(result).toContain(' * And only where the mock adapter signs in.')
        expect(inRepo(LOGIN)).toContain(
          result.slice(
            result.indexOf('/**\n * Demo credential hint.'),
            result.indexOf(DEMO_HINT_11),
          ),
        )
        expect(report.notes).toEqual([])
      })

      it('changes nothing else in the page', async () => {
        seed([LOGIN])
        const page = pastExpiredNotice(released(LOGIN))
        fixture.write(LOGIN, page)

        await upgrade()

        // Take what this step writes back out, and the page is the one it was given.
        const result = fixture.read(LOGIN)
        expect(result).not.toBe(page)
        expect(
          result
            .replace(ENV_IMPORT, '')
            .replace(DEMO_HINT_11, DEMO_HINT_10)
            .replace(DEMO_HINT_COMMENT, ''),
        ).toBe(page)
      })

      it('keeps the line endings of a CRLF page', async () => {
        seed([LOGIN])
        fixture.write(LOGIN, lf(released(LOGIN)).replaceAll('\n', '\r\n'))

        const report = await upgrade()

        const result = fixture.read(LOGIN)
        expect(result).toContain(DEMO_HINT_11.replace('\n', '\r\n'))
        expect(result.replaceAll('\r\n', '')).not.toContain('\n')
        expect(report.notes).toEqual([])
      })

      it('still changes the line under a comment the project reworded', async () => {
        seed([LOGIN])
        fixture.write(
          LOGIN,
          released(LOGIN).replace(
            ' * the address does not appear in the bundle at all.\n',
            ' * the address is not in the bundle.\n',
          ),
        )

        const report = await upgrade()

        const result = fixture.read(LOGIN)
        expect(result).toContain(' * the address is not in the bundle.\n */\n' + DEMO_HINT_11)
        expect(result).toContain(ENV_IMPORT)
        expect(report.notes).toEqual([])
      })

      it('is quiet for a page that no longer shows the demo account', async () => {
        seed([LOGIN])
        const own = pastExpiredNotice(released(LOGIN)).replace(
          DEMO_HINT_10,
          'const demoAccount = null\n',
        )
        fixture.write(LOGIN, own)

        const report = await upgrade()

        expect(fixture.read(LOGIN)).toBe(own)
        expect(report.notes).toEqual([])
      })

      it('is quiet for a page that already asks about the adapter', async () => {
        seed([LOGIN])
        const own = pastExpiredNotice(released(LOGIN)).replace(
          DEMO_HINT_10,
          'const demoAccount = __VUESTRATA_DEMO__ && isMock ? DEMO_ACCOUNT : null\n',
        )
        fixture.write(LOGIN, own)

        const report = await upgrade()

        expect(fixture.read(LOGIN)).toBe(own)
        expect(report.notes).toEqual([])
      })

      it.each([
        [
          'wrote the condition its own way',
          (page: string) =>
            page.replace(
              DEMO_HINT_10,
              'const demoAccount = __VUESTRATA_DEMO__ ? DEMO_ACCOUNT : undefined\n',
            ),
        ],
        [
          'already declares `runtimeEnv` for something else',
          (page: string) =>
            page.replace(
              'const notifications = useNotificationStore()\n',
              'const notifications = useNotificationStore()\nconst runtimeEnv = useRuntime()\n',
            ),
        ],
        [
          'imports the icons from somewhere else',
          (page: string) => page.replace(ICON_IMPORT, "import { resolveIcon } from '@/icons'\n"),
        ],
      ])('leaves a page that %s, and says what to write', async (_what, edit) => {
        seed([LOGIN])
        const own = edit(pastExpiredNotice(released(LOGIN)))
        expect(own).not.toBe(pastExpiredNotice(released(LOGIN)))
        fixture.write(LOGIN, own)

        const report = await upgrade()

        // Not the condition without its import: the page would not compile.
        expect(fixture.read(LOGIN)).toBe(own)
        expect(changed(report)).toEqual([])
        expect(texts(report)).toEqual([
          expect.stringMatching(
            /login\.vue is yours.*VUESTRATA_MOCK_ONLY.*import \{ runtimeEnv \} from '~\/lib\/config'.*runtimeEnv\.authAdapter === 'mock' \? DEMO_ACCOUNT : null/s,
          ),
        ])
      })

      it('does not mistake a comment about the old line for the line', async () => {
        seed([LOGIN])
        const own = pastExpiredNotice(pastDemoHint(released(LOGIN))).replace(
          DEMO_HINT_11,
          `// was: __VUESTRATA_DEMO__ ? DEMO_ACCOUNT : null\n${DEMO_HINT_11}`,
        )
        fixture.write(LOGIN, own)

        const report = await upgrade()

        expect(fixture.read(LOGIN)).toBe(own)
        expect(report.notes).toEqual([])
      })

      it('has nothing left to do on the next upgrade', async () => {
        seed([LOGIN])
        await upgrade()
        const once = fixture.read(LOGIN)

        const again = await upgrade({}, { version: '1.1.0-alpha.1' })

        expect(fixture.read(LOGIN)).toBe(once)
        expect(again.notes).toEqual([])
        expect(changed(again)).toEqual([])
      })
    })

    describe('the static mock handlers', () => {
      it('are grouped by module id in an unedited file, which becomes the one this release ships', async () => {
        seed([HANDLERS])

        const report = await upgrade()

        expect(fixture.read(HANDLERS)).toBe(lf(inRepo(HANDLERS)))
        expect(fixture.read(HANDLERS)).toContain('export const handlerSets = {')
        expect(changed(report)).toEqual([HANDLERS])
        expect(report.notes).toEqual([])
      })

      it('keep the flat list an ordinary demo starts exactly as it was', async () => {
        seed([HANDLERS])

        await upgrade()

        expect(fixture.read(HANDLERS).startsWith(released(HANDLERS))).toBe(true)
      })

      it('keep the line endings of a CRLF file', async () => {
        seed([HANDLERS])
        fixture.write(HANDLERS, lf(released(HANDLERS)).replaceAll('\n', '\r\n'))

        await upgrade()

        const result = fixture.read(HANDLERS)
        expect(result).toContain('export const handlerSets = {\r\n')
        expect(result.replaceAll('\r\n', '')).not.toContain('\n')
      })

      it.each([
        [
          'added a set of its own to the list',
          (file: string) =>
            file.replace('  ...auditHandlers,\n', '  ...auditHandlers,\n  ...invoiceHandlers,\n'),
        ],
        [
          'removed a set from the list',
          (file: string) => file.replace('  ...billingHandlers,\n', ''),
        ],
        [
          'already groups its handlers',
          (file: string) => `${file}\nexport const handlerSets = { users: usersHandlers }\n`,
        ],
      ])('are left alone, without a note, in a file that %s', async (_what, edit) => {
        seed([HANDLERS])
        const own = edit(released(HANDLERS))
        expect(own).not.toBe(released(HANDLERS))
        fixture.write(HANDLERS, own)

        const report = await upgrade()

        // The app says what to export when the variable is set; an upgrade
        // report is not the place for a feature the project may never turn on.
        expect(fixture.read(HANDLERS)).toBe(own)
        expect(report.notes).toEqual([])
        expect(changed(report)).toEqual([])
      })

      it('have nothing left to do on the next upgrade', async () => {
        seed([HANDLERS])
        await upgrade()
        const once = fixture.read(HANDLERS)

        const again = await upgrade({}, { version: '1.1.0-alpha.1' })

        expect(fixture.read(HANDLERS)).toBe(once)
        expect(changed(again)).toEqual([])
      })

      it('is not missed by a project that has no such file', async () => {
        seed([LOGIN])

        const report = await upgrade()

        expect(fixture.exists(HANDLERS)).toBe(false)
        expect(report.notes).toEqual([])
      })
    })
  })

  describe('what VUESTRATA_BASE_PATH needs in the project’s files', () => {
    const THEME = 'src/modules/app/plugins/bootstrap-theme.ts'
    const I18N = 'src/modules/app/plugins/i18n.ts'
    const LOCALE = 'src/modules/app/composables/useActiveLocale.ts'
    const MANIFEST = 'public/site.webmanifest'
    const READERS = [THEME, I18N, LOCALE]
    const ALL = [ROUTER, ...READERS, MANIFEST]

    const HISTORY_10 = '  history: createWebHistory(),\n'
    const HISTORY_11 = '  history: createWebHistory(import.meta.env.BASE_URL),\n'
    const RAW_PATHNAME = "typeof window === 'undefined' ? '/' : window.location.pathname"
    const PATHNAME_IMPORT = "import { appPathname } from '~/lib/config'\n"

    it('starts from files that still name the root of the origin, at both releases', () => {
      for (const tag of TAGS) {
        expect(atTag(tag, ROUTER), tag).toContain(HISTORY_10)
        for (const rel of READERS) expect(atTag(tag, rel), `${tag} ${rel}`).toContain(RAW_PATHNAME)
        expect(JSON.parse(atTag(tag, MANIFEST)!), tag).toMatchObject({
          start_url: '/',
          scope: '/',
        })
      }
    })

    it('brings every unedited file to what this release ships, with nothing to do by hand', async () => {
      seed(ALL)

      const report = await upgrade()

      expect(fixture.read(ROUTER)).toContain(HISTORY_11)
      expect(fixture.read(ROUTER)).not.toContain(HISTORY_10)
      expect(hash(fixture.read(ROUTER))).toBe(BECOMES[ROUTER])
      for (const rel of READERS) {
        const result = fixture.read(rel)
        expect(result, rel).toContain(PATHNAME_IMPORT)
        expect(result, rel).toContain('appPathname()')
        expect(withoutComments(result), rel).not.toContain('window.location.pathname')
        // One import of the name, where the formatter keeps it.
        expect(result.split(PATHNAME_IMPORT), rel).toHaveLength(2)
      }
      expect(JSON.parse(fixture.read(MANIFEST))).toMatchObject({
        start_url: '.',
        scope: '.',
        icons: [{ src: 'favicon.svg' }],
      })
      expect(fixture.read(MANIFEST)).toBe(lf(inRepo(MANIFEST)))
      expect(changed(report).sort()).toEqual([...ALL].sort())
      expect(report.notes).toEqual([])
    })

    // The files went on changing after 1.0 for other reasons (a comment, a
    // component renamed), so only these two are compared whole. The lines the
    // codemods write are the repository's lines in all five.
    it('writes the lines the repository has', async () => {
      seed(ALL)

      await upgrade()

      expect(fixture.read(ROUTER)).toBe(lf(inRepo(ROUTER)))
      expect(fixture.read(LOCALE)).toBe(lf(inRepo(LOCALE)))
      for (const rel of READERS) {
        const written = fixture
          .read(rel)
          .split('\n')
          .filter((line) => !lf(released(rel)).split('\n').includes(line))
        expect(written.length, rel).toBeGreaterThan(0)
        for (const line of written) expect(lf(inRepo(rel)), `${rel}: ${line}`).toContain(line)
      }
    })

    it('names the router once in the report, with its other change', async () => {
      seed(ALL)

      const report = await upgrade()

      const groups = report.migrations.filter((entry) => entry.changed.includes(ROUTER))
      expect(groups).toHaveLength(1)
      expect(groups[0]!.description).toMatch(/stale-chunk marker.*history with the base path/)
    })

    it('keeps the line endings each file had', async () => {
      seed(ALL)
      for (const rel of ALL) fixture.write(rel, lf(released(rel)).replaceAll('\n', '\r\n'))

      await upgrade()

      for (const rel of ALL) {
        const result = fixture.read(rel)
        expect(result.replaceAll('\r\n', ''), rel).not.toContain('\n')
        expect(result, rel).toContain('\r\n')
      }
      expect(fixture.read(ROUTER)).toContain(HISTORY_11.replace('\n', '\r\n'))
      expect(hash(fixture.read(ROUTER))).toBe(BECOMES[ROUTER])
    })

    it('has nothing left to do on the next upgrade', async () => {
      seed(ALL)
      await upgrade()
      const once = ALL.map((rel) => fixture.read(rel))

      const again = await upgrade({}, { version: '1.1.0-alpha.1' })

      expect(ALL.map((rel) => fixture.read(rel))).toEqual(once)
      expect(changed(again)).toEqual([])
      expect(again.notes).toEqual([])
    })

    it('still changes a file the project edited somewhere else', async () => {
      seed(ALL)
      const router = released(ROUTER).replace(
        'export const layoutMap',
        '// our own layouts are registered below\nexport const layoutMap',
      )
      const i18n = `${released(I18N)}\nexport const OUR_OWN = 1\n`
      fixture.write(ROUTER, router)
      fixture.write(I18N, i18n)

      const report = await upgrade()

      expect(fixture.read(ROUTER)).toContain('// our own layouts are registered below')
      expect(fixture.read(ROUTER)).toContain(HISTORY_11)
      expect(fixture.read(I18N)).toContain('export const OUR_OWN = 1')
      expect(fixture.read(I18N)).toContain('  return appPathname()\n')
      expect(report.notes).toEqual([])
    })

    describe('a router whose history line the project rewrote', () => {
      it.each([
        ['a scroll-restoring history', "  history: createWebHistory(), // 'manual' scroll\n"],
        ['a history built elsewhere', '  history: (() => createWebHistory())(),\n'],
      ])('is left alone, with the line to write: %s', async (_what, line) => {
        seed([ROUTER])
        const own = released(ROUTER).replace(HISTORY_10, line)
        expect(own).not.toBe(released(ROUTER))
        fixture.write(ROUTER, own)

        const report = await upgrade()

        // The other change to the file is made all the same.
        expect(fixture.read(ROUTER)).toContain(line)
        expect(fixture.read(ROUTER)).toContain(
          'if (!failure && from !== START_LOCATION) clearStaleChunkMarker()',
        )
        expect(texts(report)).toEqual([
          expect.stringContaining('createWebHistory(import.meta.env.BASE_URL)'),
        ])
        expect(texts(report)[0]).toMatch(/Nothing to do if you serve the app at the root/)
        expect(report.notes[0]?.rel).toBe(ROUTER)
      })

      it.each([
        ['already passes the base', '  history: createWebHistory(import.meta.env.BASE_URL),\n'],
        ['passes a base of its own', "  history: createWebHistory('/portal/'),\n"],
        ['uses another history', '  history: createWebHashHistory(),\n'],
      ])('is left alone without a note when it %s', async (_what, line) => {
        seed([ROUTER])
        const own = released(ROUTER).replace(HISTORY_10, line)
        fixture.write(ROUTER, own)

        const report = await upgrade()

        expect(fixture.read(ROUTER)).toContain(line)
        expect(fixture.read(ROUTER).split('history: ')).toHaveLength(2)
        expect(report.notes).toEqual([])
      })

      it('is not fooled by the call in a comment', async () => {
        seed([ROUTER])
        const own = released(ROUTER).replace(
          HISTORY_10,
          "  // was: createWebHistory()\n  history: createWebHistory('/portal/'),\n",
        )
        fixture.write(ROUTER, own)

        const report = await upgrade()

        expect(fixture.read(ROUTER)).toContain("createWebHistory('/portal/')")
        expect(report.notes).toEqual([])
      })
    })

    describe('a file that reads the address bar in its own way', () => {
      it.each(READERS)('is left alone, with the call to write: %s', async (rel) => {
        seed([rel])
        const own = released(rel).replace(
          RAW_PATHNAME,
          "typeof window === 'undefined' ? '/' : window.location.pathname.toLowerCase()",
        )
        expect(own).not.toBe(released(rel))
        fixture.write(rel, own)

        const report = await upgrade()

        expect(fixture.read(rel)).toBe(own)
        expect(texts(report)).toEqual([expect.stringContaining('appPathname()')])
        expect(texts(report)[0]).toContain("import { appPathname } from '~/lib/config'")
        expect(texts(report)[0]).toMatch(/Nothing to do if you serve the app at the root/)
        expect(report.notes[0]?.rel).toBe(rel)
      })

      it.each(READERS)('never gets the name twice: %s', async (rel) => {
        seed([rel])
        // The shipped lines are intact, and the file has the name already.
        const own = `${released(rel)}\nconst appPathname = () => '/'\nvoid appPathname\n`
        fixture.write(rel, own)

        const report = await upgrade()

        expect(fixture.read(rel)).toBe(own)
        expect(fixture.read(rel)).not.toContain(PATHNAME_IMPORT)
        expect(texts(report)).toEqual([expect.stringContaining('appPathname()')])
      })

      it('is done once the file no longer reads it at all', async () => {
        seed([THEME])
        const own = released(THEME).replace(RAW_PATHNAME, "'/'")
        fixture.write(THEME, own)

        const report = await upgrade()

        expect(fixture.read(THEME)).toBe(own)
        expect(report.notes).toEqual([])
      })
    })

    describe('a manifest the project made its own', () => {
      it('is left alone, with the values to write, while it names the root', async () => {
        seed([MANIFEST])
        const own = released(MANIFEST).replace('"start_url": "/"', '"start_url": "/?source=pwa"')
        expect(own).not.toBe(released(MANIFEST))
        fixture.write(MANIFEST, own)

        const report = await upgrade()

        expect(fixture.read(MANIFEST)).toBe(own)
        expect(texts(report)).toEqual([expect.stringContaining('"start_url": "."')])
        expect(texts(report)[0]).toMatch(/Nothing to do if you serve the app at the root/)
      })

      it('gets the start URL and scope even when the icon is its own', async () => {
        seed([MANIFEST])
        const own = released(MANIFEST).replace('"src": "/favicon.svg"', '"src": "/imgs/logo.png"')
        fixture.write(MANIFEST, own)

        const report = await upgrade()

        expect(JSON.parse(fixture.read(MANIFEST))).toMatchObject({
          start_url: '.',
          scope: '.',
          icons: [{ src: '/imgs/logo.png' }],
        })
        expect(report.notes).toEqual([])
      })

      it.each([
        ['already relative', (file: string) => file.replaceAll('": "/"', '": "."')],
        ['under a prefix of its own', (file: string) => file.replaceAll('": "/"', '": "/portal/"')],
        ['not JSON any more', (file: string) => `// ours\n${file}`],
      ])('is left alone without a note when it is %s', async (_what, edit) => {
        seed([MANIFEST])
        const own = edit(released(MANIFEST))
        expect(own).not.toBe(released(MANIFEST))
        fixture.write(MANIFEST, own)

        const report = await upgrade()

        expect(fixture.read(MANIFEST)).toBe(own)
        expect(report.notes).toEqual([])
      })
    })

    it('is not missed by a project that has none of these files', async () => {
      seed([LOGIN])

      const report = await upgrade()

      for (const rel of [...READERS, MANIFEST]) expect(fixture.exists(rel), rel).toBe(false)
      expect(report.notes).toEqual([])
    })
  })

  describe('app/types/index.ts and src/env.d.ts', () => {
    const OLD_LINE = "  authProvider: 'jwt' | 'oauth' | 'mock'\n"
    const OLD_IMPORT = "import type { SessionPersistence } from '~/lib/config/env.schema'\n"
    const NEW_IMPORT =
      "import type { AuthAdapterName, SessionPersistence } from '~/lib/config/env.schema'\n"
    const NOTE = /app\/types\/index\.ts is yours.*authProvider: AuthAdapterName/s

    it('types the configured adapter by AuthAdapterName in an unedited file, and changes nothing else', async () => {
      seed([APP_TYPES])
      expect(released(APP_TYPES)).toContain(OLD_LINE)
      expect(released(APP_TYPES)).toContain(OLD_IMPORT)

      const report = await upgrade()

      const result = fixture.read(APP_TYPES)
      expect(hash(result)).toBe(BECOMES[APP_TYPES])
      expect(result).toContain(NEW_IMPORT)
      expect(result).toContain('\n  authProvider: AuthAdapterName\n')
      expect(result).not.toContain(OLD_LINE)
      // The two shipped lines, and the comment that says what the type admits.
      const [before, after] = released(APP_TYPES).replace(OLD_IMPORT, NEW_IMPORT).split(OLD_LINE)
      expect(result.startsWith(before!)).toBe(true)
      expect(result.endsWith(after!)).toBe(true)
      expect(changed(report)).toEqual([APP_TYPES])
      expect(report.notes).toEqual([])

      const again = await upgrade({}, { version: '1.1.0-alpha.1' })
      expect(changed(again)).toEqual([])
      expect(again.notes).toEqual([])
    })

    it('does the same for a file the project extended elsewhere, in the line endings it has', async () => {
      seed([APP_TYPES])
      const own = released(APP_TYPES)
        .replace('  useMocks: boolean\n', '  useMocks: boolean\n  tenant: string\n')
        .replaceAll('\n', '\r\n')
      fixture.write(APP_TYPES, own)

      const report = await upgrade()

      const result = fixture.read(APP_TYPES)
      expect(result).toContain('  tenant: string\r\n')
      expect(result).toContain('  authProvider: AuthAdapterName\r\n')
      expect(result).toContain(NEW_IMPORT.replace('\n', '\r\n'))
      expect(result.replaceAll('\r\n', '')).not.toContain('\n')
      expect(report.notes).toEqual([])
    })

    it.each([
      [
        'lists a name of its own',
        (source: string) =>
          source.replace(OLD_LINE, "  authProvider: 'jwt' | 'oauth' | 'mock' | 'acme'\n"),
      ],
      [
        'imports something else from env.schema too',
        (source: string) =>
          source.replace(
            OLD_IMPORT,
            "import type { RuntimeMode, SessionPersistence } from '~/lib/config/env.schema'\n",
          ),
      ],
      [
        'declares an AuthAdapterName of its own',
        (source: string) =>
          source.replace(OLD_IMPORT, `${OLD_IMPORT}type AuthAdapterName = 'jwt' | 'oauth'\n`),
      ],
    ])('leaves a file that %s, and gives the line to write', async (_what, edit) => {
      seed([APP_TYPES])
      const own = edit(released(APP_TYPES))
      expect(own).not.toBe(released(APP_TYPES))
      fixture.write(APP_TYPES, own)

      const report = await upgrade()

      // Not half of it, and not a second binding of the name.
      expect(fixture.read(APP_TYPES)).toBe(own)
      expect(changed(report)).toEqual([])
      expect(texts(report)).toEqual([expect.stringMatching(NOTE)])
      expect(fixture.exists(incoming(APP_TYPES))).toBe(false)
    })

    it.each([
      ['already uses the type', '  authProvider: AuthAdapterName\n'],
      ['accepts any name', '  authProvider: string\n'],
      ['already lists session', "  authProvider: 'jwt' | 'oauth' | 'mock' | 'session'\n"],
      [
        'only mentions the old union in a comment',
        "  // authProvider: 'jwt' | 'oauth' | 'mock'\n  authProvider: string\n",
      ],
    ])('is quiet for a file that %s', async (_what, line) => {
      seed([APP_TYPES])
      fixture.write(APP_TYPES, released(APP_TYPES).replace(OLD_LINE, line))

      const report = await upgrade()

      expect(changed(report)).toEqual([])
      expect(report.notes).toEqual([])
    })

    it('ships the property typed that way, so a new project needs nothing', () => {
      const shipped = inRepo(APP_TYPES)

      expect(shipped).toContain('  authProvider: AuthAdapterName\n')
      expect(shipped).toMatch(
        /import type \{[^}]*\bAuthAdapterName\b[^}]*\} from '~\/lib\/config\/env\.schema'/,
      )
    })

    it('adds session to the names src/env.d.ts lists, where the line is the shipped one', async () => {
      seed([ENV_DTS])

      const report = await upgrade()

      const result = fixture.read(ENV_DTS)
      expect(hash(result)).toBe(BECOMES[ENV_DTS])
      expect(result).toContain(
        "  readonly VUESTRATA_AUTH_ADAPTER: 'jwt' | 'oauth' | 'session' | 'mock' | (string & {})\n",
      )
      expect(lf(inRepo(ENV_DTS))).toContain(
        "  readonly VUESTRATA_AUTH_ADAPTER: 'jwt' | 'oauth' | 'session' | 'mock' | (string & {})\n",
      )
      expect(changed(report)).toEqual([ENV_DTS])
      expect(report.notes).toEqual([])
    })

    it('says nothing about an env.d.ts the project typed its own way', async () => {
      seed([ENV_DTS])
      const own = released(ENV_DTS).replace(
        "VUESTRATA_AUTH_ADAPTER: 'jwt' | 'oauth' | 'mock'",
        'VUESTRATA_AUTH_ADAPTER: string',
      )
      fixture.write(ENV_DTS, own)

      const report = await upgrade()

      expect(fixture.read(ENV_DTS)).toBe(own)
      expect(changed(report)).toEqual([])
      expect(report.notes).toEqual([])
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

    it('is named once in the report, though four steps change it', async () => {
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
        // The library alone, without the tslib it shares with the app.
        '              includeDependenciesRecursively: false,',
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
          "{ name: 'charts-vendor', test: /node_modules[\\\\/](?:echarts|vue-echarts|zrender)[\\\\/]/, priority: 10, includeDependenciesRecursively: false }",
        )
        // And only that group: the note says what the option is for.
        expect(note?.split('includeDependenciesRecursively: false }')).toHaveLength(2)
        expect(note).toContain('the tslib it depends on gets a chunk of its own')
        expect(fixture.exists(incoming(VITE))).toBe(false)
      })

      // "Declares" means in code. Read anywhere, the word in a comment made the
      // step think the project had groups already: no rewrite, and no note,
      // for a config that has the defect and fails the bundle check.
      it.each([
        [
          'a line comment',
          '        // TODO: move to codeSplitting: { groups } once rolldown has it\n',
        ],
        [
          'a block comment',
          '        /* advancedChunks: { groups: [] } was tried and reverted */\n',
        ],
      ])('is not put off by %s that mentions groups', async (_, comment) => {
        seed([VITE])
        const own = lf(released(VITE)).replace(FUNCTION, comment + FUNCTION)
        expect(own).not.toBe(lf(released(VITE)))
        fixture.write(VITE, own)

        const report = await upgrade()

        const result = lf(fixture.read(VITE))
        // The function is still the shipped one, so it is replaced.
        expect(result).not.toContain(FUNCTION)
        expect(result).toContain(comment)
        expect(result).toContain(GROUPS)
        expect(result).toContain(CHARTS_GROUP)
        expect(chunkNotes(report)).toEqual([])
      })

      it('gives the note to a config whose function changed and whose comment mentions groups', async () => {
        seed([VITE])
        const own = lf(released(VITE))
          .replace(FUNCTION, `        // codeSplitting: see the rolldown docs\n${FUNCTION}`)
          .replace('// Charting — large;', '// Charts — large;')
        fixture.write(VITE, own)

        const report = await upgrade()

        expect(lf(fixture.read(VITE))).toContain(FUNCTION)
        expect(chunkNotes(report)).toHaveLength(1)
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

describe.skipIf(!CLI_PRESENT || !hasTags)('a user may hold several roles', () => {
  const AUTH_STORE = 'src/modules/app/stores/auth.ts'
  const APP_TYPES = 'src/modules/app/types/index.ts'
  const ROLES_LINE = '    roles: authStore.userRoles,\n'
  const SUBJECT =
    '    role: authStore.userRole,\n' +
    ROLES_LINE +
    '    permissions: authStore.userPermissions as Permission[] | undefined,\n'

  /** This release's auth store, which replaces an unedited 1.0 one. */
  const shipped = () => ({ [AUTH_STORE]: inRepo(AUTH_STORE) })
  /** The notes of this group: a store that was held back has one of its own. */
  const guardNotes = (report: Report) =>
    texts(report).filter((text) => text.includes('resolveRouteAccess()'))

  describe('plugins/router.ts', () => {
    it('hands the guard the roles, beside a store this upgrade replaces', async () => {
      seed([ROUTER, AUTH_STORE])

      const report = await upgrade(shipped())

      const result = fixture.read(ROUTER)
      expect(result).toContain(SUBJECT)
      // The store it now reads `userRoles` from is the one that has it.
      expect(fixture.read(AUTH_STORE)).toContain('userRoles')
      expect(guardNotes(report)).toEqual([])
      // And it is the call this repository's own router makes.
      expect(lf(inRepo(ROUTER))).toContain(SUBJECT)
    })

    it('makes the same change in a file the project added a layout to', async () => {
      seed([ROUTER, AUTH_STORE])
      fixture.write(
        ROUTER,
        released(ROUTER).replace(
          'export const layoutMap',
          '// our own layouts are registered below\nexport const layoutMap',
        ),
      )

      const report = await upgrade(shipped())

      expect(fixture.read(ROUTER)).toContain('// our own layouts are registered below')
      expect(fixture.read(ROUTER)).toContain(SUBJECT)
      expect(guardNotes(report)).toEqual([])
    })

    it('keeps the line endings the file had', async () => {
      seed([ROUTER, AUTH_STORE])
      fixture.write(ROUTER, released(ROUTER).replaceAll('\n', '\r\n'))

      await upgrade(shipped())

      const result = fixture.read(ROUTER)
      expect(result).not.toMatch(/[^\r]\n/)
      expect(result).toContain(SUBJECT.replaceAll('\n', '\r\n'))
    })

    it('does nothing the second time', async () => {
      seed([ROUTER, AUTH_STORE])
      await upgrade(shipped())
      const once = fixture.read(ROUTER)

      const again = await upgrade(shipped(), { version: '1.1.0-alpha.1' })

      expect(fixture.read(ROUTER)).toBe(once)
      expect(once.split(ROLES_LINE)).toHaveLength(2)
      expect(guardNotes(again)).toEqual([])
      expect(changed(again)).not.toContain(ROUTER)
    })

    it('waits for an auth store the project edited and keeps, and says why', async () => {
      seed([ROUTER, AUTH_STORE])
      fixture.write(AUTH_STORE, `${released(AUTH_STORE)}\n// ours\n`)

      const report = await upgrade(shipped())

      // `authStore.userRoles` does not exist on the 1.0 store that stays.
      expect(fixture.read(ROUTER)).not.toContain('userRoles')
      expect(guardNotes(report)).toHaveLength(1)
      expect(guardNotes(report)[0]).toContain('a copy you edited and keep')
      expect(guardNotes(report)[0]).toContain('`roles: authStore.userRoles,`')
      expect(guardNotes(report)[0]).toContain('never looser')
    })

    it('follows on the upgrade after the project merged the new store', async () => {
      seed([ROUTER, AUTH_STORE])
      fixture.write(AUTH_STORE, `${released(AUTH_STORE)}\n// ours\n`)
      await upgrade(shipped())
      fixture.write(AUTH_STORE, `${inRepo(AUTH_STORE)}\n// ours\n`)

      const again = await upgrade(shipped(), { version: '1.1.0-alpha.1' })

      expect(fixture.read(ROUTER)).toContain(SUBJECT)
      expect(guardNotes(again)).toEqual([])
    })

    it('leaves a call the project rewrote, with the line to add', async () => {
      seed([ROUTER, AUTH_STORE])
      const edited = released(ROUTER).replace(
        '    role: authStore.userRole,\n',
        '    role: impersonated.value ?? authStore.userRole,\n',
      )
      expect(edited).not.toBe(released(ROUTER))
      fixture.write(ROUTER, edited)

      const report = await upgrade(shipped())

      expect(fixture.read(ROUTER)).not.toContain('userRoles')
      expect(guardNotes(report)).toEqual([
        expect.stringContaining('its call to resolveRouteAccess() is not the one'),
      ])
      expect(guardNotes(report)[0]).toContain('Add `roles: authStore.userRoles,`')
      expect(report.notes.find((note) => note.text === guardNotes(report)[0])?.rel).toBe(ROUTER)
    })

    it('is quiet for a router that passes roles its own way', async () => {
      seed([ROUTER, AUTH_STORE])
      const own = released(ROUTER).replace(
        '    role: authStore.userRole,\n',
        '    role: authStore.userRole,\n    roles: rolesOf(authStore.user),\n',
      )
      fixture.write(ROUTER, own)

      const report = await upgrade(shipped())

      expect(fixture.read(ROUTER)).toContain('roles: rolesOf(authStore.user),')
      expect(fixture.read(ROUTER)).not.toContain('userRoles')
      expect(guardNotes(report)).toEqual([])
    })

    it('says nothing in a project with no auth store where the template has one', async () => {
      seed([ROUTER])

      const report = await upgrade()

      expect(fixture.read(ROUTER)).not.toContain('userRoles')
      expect(report.notes).toEqual([])
    })
  })

  describe('app/types/index.ts', () => {
    const MEMBER = '  roles?: Role[]\n  permissions?: Permission[]\n'
    const DECLARED = /  role: Role\n[\s\S]*?  permissions\?: Permission\[\]\n/

    it('gives User the roles member, as this release declares it', async () => {
      seed([APP_TYPES])

      const report = await upgrade()

      const result = fixture.read(APP_TYPES)
      expect(result).toContain(MEMBER)
      expect(result.split('roles?: Role[]')).toHaveLength(2)
      expect(report.notes).toEqual([])
      // The member and its comment are the ones this repository's file has.
      expect(DECLARED.exec(result)?.[0]).toBe(DECLARED.exec(lf(inRepo(APP_TYPES)))?.[0])
    })

    it('keeps the line endings the file had, and does nothing the second time', async () => {
      seed([APP_TYPES])
      fixture.write(APP_TYPES, released(APP_TYPES).replaceAll('\n', '\r\n'))

      await upgrade()
      const once = fixture.read(APP_TYPES)
      const again = await upgrade({}, { version: '1.1.0-alpha.1' })

      expect(once).not.toMatch(/[^\r]\n/)
      expect(once).toContain(MEMBER.replaceAll('\n', '\r\n'))
      expect(fixture.read(APP_TYPES)).toBe(once)
      expect(again.notes).toEqual([])
    })

    it('leaves a User the project already gave a roles member, of whatever type', async () => {
      seed([APP_TYPES])
      const own = released(APP_TYPES).replace(
        '  role: Role\n',
        '  role: Role\n  roles: Array<{ id: number; name: string }>\n',
      )
      fixture.write(APP_TYPES, own)

      const report = await upgrade()

      expect(fixture.read(APP_TYPES)).toBe(own)
      expect(report.notes).toEqual([])
    })

    it('is not fooled by a comment that mentions roles', async () => {
      seed([APP_TYPES])
      fixture.write(
        APP_TYPES,
        released(APP_TYPES).replace(
          '  role: Role\n',
          '  // roles: see the IAM service\n  role: Role\n',
        ),
      )

      const report = await upgrade()

      // The member is still missing, and the comment does not stand in for it.
      expect(fixture.read(APP_TYPES)).toContain(MEMBER)
      expect(fixture.read(APP_TYPES)).toContain('  // roles: see the IAM service\n')
      expect(report.notes).toEqual([])
    })

    it('leaves a User the project reshaped, with the member to add', async () => {
      seed([APP_TYPES])
      const reshaped = released(APP_TYPES).replace(
        '  permissions?: Permission[]\n  emailVerified?: boolean\n',
        '  permissions?: Permission[]\n  tenantId: string\n  emailVerified?: boolean\n',
      )
      expect(reshaped).not.toBe(released(APP_TYPES))
      fixture.write(APP_TYPES, reshaped)

      const report = await upgrade()

      expect(fixture.read(APP_TYPES)).toBe(reshaped)
      expect(texts(report)).toEqual([expect.stringContaining('add `roles?: Role[]`')])
      expect(report.notes[0]?.rel).toBe(APP_TYPES)
    })

    it('has nothing to say to a project that declares User somewhere else', async () => {
      seed([APP_TYPES])
      const moved = released(APP_TYPES).replace(/export interface User \{[\s\S]*?\n\}\n/, '')
      expect(moved).not.toContain('interface User {')
      fixture.write(APP_TYPES, moved)

      const report = await upgrade()

      expect(fixture.read(APP_TYPES)).toBe(moved)
      expect(report.notes).toEqual([])
    })
  })
})
