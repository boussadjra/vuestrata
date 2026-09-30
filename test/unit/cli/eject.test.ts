import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

// @ts-expect-error - the CLI is plain ESM JavaScript with no type declarations.
import { planEject, runEject } from '../../../packages/cli/src/commands/eject.mjs'
// @ts-expect-error - see above.
import { dropCliRoundtrip, rewriteDocLinks } from '../../../packages/cli/src/lib/eject/project.mjs'
// @ts-expect-error - see above.
import * as lockfile from '../../../packages/cli/src/lib/lockfile.mjs'
// @ts-expect-error - see above.
import { loadManifest } from '../../../packages/cli/src/lib/manifest.mjs'
import { createFixture, type Fixture } from './fixture'

const { driftedFiles, emptyLock, hashFor, readLock, writeLock } = lockfile

/**
 * `vuestrata eject` on a project shaped like the template.
 *
 * The files Vuestrata owns are copied from this repository rather than invented,
 * so a test that says "eject leaves `types.ts` alone" is about the real file,
 * and so is the regex that finds the docs redirects in `router.ts`.
 */

const FLAGS = { 'allow-dirty': true, 'no-format': true }

const TYPES = 'src/modules/core/lib/rbac/types.ts'
const INHERITANCE = 'src/modules/core/lib/rbac/inheritance.ts'
const OVERRIDES = 'src/modules/app/config/rbac.overrides.ts'

const real = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

const barrel = (id: string, origin: string, permissions: string[], routes: string[]) => `
const ${id}Module = {
  config: {
    id: '${id}',
    origin: '${origin}',
    permissions: [${permissions.map((permission) => `'${permission}'`).join(', ')}],
  },
  routes: [
${routes.map((route) => `    {\n      path: '${route}',\n    },`).join('\n')}
  ],
}

export default ${id}Module
`

const SETUP = `import customersModule from './customers'
import ordersModule from './orders'
import usersModule from './users'

export const appModules = [
  // vuestrata:modules-start
  // customers: the reference implementation
  customersModule,
  // orders: nested nav
  ordersModule,
  usersModule,
  // vuestrata:modules-end
  // app:modules-start
  // app:modules-end
]
`

const README = `# Fixture

**[Live demo](https://example.test/)** · [Documentation](docs/index.md)

What "ready" means is split three ways in [Readiness](docs/9.readiness.md#the-demo).
See [\`docs/9.recipes/\`](docs/9.recipes/) for the generators, and \`docs/9.readiness.md\`.

\`\`\`md
[left alone](docs/index.md) inside a fence
\`\`\`
`

const PACKAGE = {
  name: 'fixture',
  scripts: {
    gen: 'node packages/cli/src/index.mjs',
    'gen:module': 'node packages/cli/src/index.mjs add module',
    lint: 'vp lint && node scripts/docs/check-links.mjs --quiet && node scripts/release/check-template-lock.mjs',
    'lint:maintainer': 'node scripts/release/maintainer-gates.mjs',
    'version:show': 'node scripts/release/version.mjs show',
    'release:verify': 'vp check && vp test --run',
    'cli:payload': 'node packages/cli/scripts/build-payload.mjs',
    doctor: 'node packages/cli/src/index.mjs doctor',
    'test:e2e': 'playwright test',
  },
  dependencies: {
    vue: '^3.5.0',
    'axe-core': '^4.13.0',
    shiki: '^4.4.2',
    '@shikijs/langs': '^4.4.2',
    'beautiful-mermaid': '^1.1.3',
    comark: 'file:vendor/comark-1.0.0.tgz',
  },
  devDependencies: { '@axe-core/playwright': '^4.12.1' },
}

const DOCKERFILE = `FROM node:22

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# \`comark\` is a committed tarball (see vendor/README.md), so it must be present
# before install resolves the lockfile.
COPY vendor/ ./vendor/
RUN vp install --frozen-lockfile
`

const AUTH_SPEC = `import { test } from '@playwright/test'

test('the login page renders', async ({ page }) => {
  await page.goto('/auth/login')
})
`

const MIXED_SPEC = `import { test } from '@playwright/test'

for (const path of ['/auth/login', '/dashboard/orders', '/403']) {
  test(\`\${path} loads\`, async ({ page }) => {
    await page.goto(path)
  })
}

test('an orders page', async ({ page }) => {
  await page.goto('/dashboard/orders/new')
})

test('the account page', async ({ page }) => {
  await page.goto('/dashboard/account')
})
`

let fixture: Fixture
let before: { types: string; inheritance: string }

function seed() {
  const f = fixture
  f.write('package.json', `${JSON.stringify(PACKAGE, null, 2)}\n`)
  f.write('Dockerfile', DOCKERFILE)
  f.write('README.md', README)
  f.write('CONTRIBUTING.md', 'Read [the route rules](docs/2.architecture/4.route-pages.md).\n')
  f.write('SECURITY.md', 'Tracked in `docs/9.readiness.md`.\n')
  f.write('docs/index.md', '# Docs\n')
  f.write('docs/9.readiness.md', '# Readiness\n')
  f.write('vendor/README.md', '# vendor\n')
  f.write('vendor/comark-1.0.0.tgz', 'tarball')

  f.write('.github/workflows/ci.yml', real('.github/workflows/ci.yml'))
  f.write('.github/workflows/deploy-demo.yml', 'name: demo\n')
  f.write('.github/workflows/release.yml', 'name: release\n')
  f.write('packages/cli/src/index.mjs', '// the CLI\n')
  f.write('packages/cli/package.json', '{}\n')
  f.write('scripts/release/check-template-lock.mjs', '// lock gate\n')
  f.write('scripts/release/version.mjs', '// bump\n')
  f.write('test/unit/cli/upgrade.test.ts', '// cli tests\n')
  f.write('test/unit/architecture/public-surface.test.ts', '// surface\n')
  f.write('test/unit/architecture/__snapshots__/public-surface.test.ts.snap', '// snap\n')
  f.write(
    'test/unit/orders/use-order.test.ts',
    "import { useOrder } from '@/modules/orders/composables/useOrder'\n",
  )
  f.write(
    'test/unit/customers/kept.test.ts',
    "import { useCustomers } from '@/modules/customers/composables/useCustomers'\n",
  )

  f.write('src/modules/setup.ts', SETUP)
  f.write(
    'src/modules/orders/index.ts',
    barrel(
      'orders',
      'demo',
      ['orders:read', 'orders:manage', 'customers:read'],
      ['/dashboard/orders', '/dashboard/orders/new'],
    ),
  )
  f.write(
    'src/modules/customers/index.ts',
    barrel('customers', 'demo', ['customers:read', 'customers:manage'], ['/dashboard/customers']),
  )
  f.write(
    'src/modules/users/index.ts',
    barrel('users', 'template', ['users:read'], ['/dashboard/users']),
  )
  f.write('src/modules/orders/composables/useOrder.ts', 'export const useOrder = 1\n')

  f.write('src/modules/app/config/component-docs.ts', 'export {}\n')
  f.write('src/modules/app/config/comark.ts', 'export {}\n')
  f.write('src/modules/app/plugins/router.ts', real('src/modules/app/plugins/router.ts'))
  f.write('src/modules/app/pages/index.vue', '<template><h1>Hero</h1></template>\n')
  f.write(
    'src/modules/app/pages/[...notfound].vue',
    real('src/modules/app/pages/[...notfound].vue'),
  )
  f.write('src/modules/app/pages/docs/index.vue', '<template>docs</template>\n')
  f.write(
    'src/modules/app/components/docs/DocsShell.vue',
    '<script setup lang="ts">\nimport { codeToHtml } from \'shiki\'\n</script>\n',
  )

  f.write(TYPES, real(TYPES))
  f.write(INHERITANCE, real(INHERITANCE))
  f.write(OVERRIDES, real(OVERRIDES))

  f.write(
    'e2e/docs.spec.ts',
    "import { test } from '@playwright/test'\n\ntest('docs', async ({ page }) => {\n  await page.goto('/docs')\n})\n",
  )
  f.write(
    'e2e/orders.spec.ts',
    "import { test } from '@playwright/test'\n\ntest('orders', async ({ page }) => {\n  await page.goto('/dashboard/orders')\n})\n",
  )
  f.write('e2e/auth.spec.ts', AUTH_SPEC)
  f.write('e2e/mixed.spec.ts', MIXED_SPEC)

  const lock = emptyLock('1.0.0')
  lock.files[TYPES] = {
    class: 'merged',
    hash: hashFor(TYPES, real(TYPES), 'merged'),
    since: '1.0.0',
  }
  lock.files[INHERITANCE] = {
    class: 'managed',
    hash: hashFor(INHERITANCE, real(INHERITANCE), 'managed'),
    since: '1.0.0',
  }
  lock.files[OVERRIDES] = { class: 'seeded', since: '1.0.0' }
  lock.files['src/modules/app/config/comark.ts'] = {
    class: 'managed',
    hash: 'sha256-x',
    since: '1.0.0',
  }
  writeLock(f.project, lock)
}

/** Every file with a digest of its contents, so a dry run can prove it wrote nothing. */
function snapshot(dir: string, base = dir): Record<string, string> {
  const found: Record<string, string> = {}
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) Object.assign(found, snapshot(full, base))
    else {
      found[path.relative(base, full)] = crypto
        .createHash('sha256')
        .update(fs.readFileSync(full))
        .digest('hex')
    }
  }
  return found
}

beforeEach(() => {
  fixture = createFixture()
  seed()
  before = { types: fixture.read(TYPES), inheritance: fixture.read(INHERITANCE) }
})

afterEach(() => {
  fixture.cleanup()
})

const eject = (flags: Record<string, unknown> = {}) =>
  runEject({ root: fixture.project, flags: { ...FLAGS, ...flags } })

describe('eject and the files Vuestrata owns', () => {
  it('leaves core/lib/rbac byte-identical, and the lock reporting no drift', () => {
    eject()

    expect(fixture.read(TYPES)).toBe(before.types)
    expect(fixture.read(INHERITANCE)).toBe(before.inheritance)
    expect(driftedFiles(fixture.project, readLock(fixture.project))).toEqual([])
    expect(readLock(fixture.project).files[TYPES].class).toBe('merged')
  })

  it('withdraws the removed modules permissions in rbac.overrides.ts instead', () => {
    eject()

    const overrides = fixture.read(OVERRIDES)
    const region = overrides.slice(
      overrides.indexOf('// app:withdrawn-start'),
      overrides.indexOf('// app:withdrawn-end'),
    )
    expect(region).toContain("'orders:read',")
    expect(region).toContain("'orders:manage',")
    // Also declared by the module that stays: still granted.
    expect(region).not.toContain('customers:read')
    // Everything outside the region is what the release shipped.
    expect(overrides.replace(region, '')).toBe(
      real(OVERRIDES).replace(
        real(OVERRIDES).slice(
          real(OVERRIDES).indexOf('// app:withdrawn-start'),
          real(OVERRIDES).indexOf('// app:withdrawn-end'),
        ),
        '',
      ),
    )
  })

  it('records what it removed, and leaves the seeded file tracked', () => {
    eject()

    const lock = readLock(fixture.project)
    expect(lock.ejected).toContain('src/modules/orders/index.ts')
    expect(lock.ejected).toContain('src/modules/app/config/comark.ts')
    expect(lock.ejected.some((rel: string) => rel.startsWith('packages/'))).toBe(false)
    expect(lock.files['src/modules/app/config/comark.ts']).toBeUndefined()
    expect(lock.files[OVERRIDES]).toEqual({ class: 'seeded', since: '1.0.0' })
  })

  it('refuses, touching nothing, when rbac.overrides.ts is missing', () => {
    fixture.remove(OVERRIDES)
    const files = snapshot(fixture.project)

    expect(() =>
      planEject({ root: fixture.project, manifest: loadManifest(fixture.project), flags: FLAGS }),
    ).toThrow(/rbac\.overrides\.ts does not exist.*vuestrata upgrade/s)
    expect(snapshot(fixture.project)).toEqual(files)
  })

  it('writes nothing on a dry run', () => {
    const files = snapshot(fixture.project)
    eject({ 'dry-run': true })
    expect(snapshot(fixture.project)).toEqual(files)
  })
})

describe('eject and the reference module', () => {
  it('keeps customers by default, with its tests', () => {
    eject()

    expect(fixture.exists('src/modules/customers/index.ts')).toBe(true)
    expect(fixture.read('src/modules/setup.ts')).toContain('customersModule,')
    expect(fixture.exists('test/unit/customers/kept.test.ts')).toBe(true)
    expect(fixture.read(OVERRIDES)).not.toContain("'customers:manage'")
  })

  it('removes customers with --no-keep-customers, and withdraws its permissions', () => {
    eject({ 'no-keep-customers': true })

    expect(fixture.exists('src/modules/customers')).toBe(false)
    expect(fixture.read('src/modules/setup.ts')).not.toContain('customersModule')
    expect(fixture.exists('test/unit/customers/kept.test.ts')).toBe(false)
    expect(fixture.read(OVERRIDES)).toContain("'customers:manage',")
  })

  it('unwires the modules it removes', () => {
    eject()

    const setup = fixture.read('src/modules/setup.ts')
    expect(setup).not.toContain('ordersModule')
    expect(setup).not.toContain('// orders:')
    expect(setup).toContain('usersModule,')
    expect(fixture.exists('test/unit/orders/use-order.test.ts')).toBe(false)
  })
})

describe('eject and the end-to-end specs', () => {
  it('deletes a spec that visits only removed routes', () => {
    eject()

    expect(fixture.exists('e2e/docs.spec.ts')).toBe(false)
    expect(fixture.exists('e2e/orders.spec.ts')).toBe(false)
  })

  it('keeps a spec that visits nothing removed, untouched', () => {
    eject()
    expect(fixture.read('e2e/auth.spec.ts')).toBe(AUTH_SPEC)
  })

  it('prunes the routes and tests of a mixed spec, keeping the rest', () => {
    eject()

    const spec = fixture.read('e2e/mixed.spec.ts')
    expect(spec).toContain("['/auth/login', '/403']")
    expect(spec).not.toContain('/dashboard/orders')
    expect(spec).toContain("test('the account page'")
    expect(spec).not.toContain('an orders page')
  })
})

describe('eject and the maintainer-only files', () => {
  it('removes the CLI, the release gates, their tests and the maintainer workflows', () => {
    eject()

    for (const rel of [
      'packages/cli',
      'scripts/release',
      'test/unit/cli',
      'test/unit/architecture/public-surface.test.ts',
      'test/unit/architecture/__snapshots__/public-surface.test.ts.snap',
      '.github/workflows/deploy-demo.yml',
      '.github/workflows/release.yml',
    ]) {
      expect(fixture.exists(rel), rel).toBe(false)
    }
  })

  it('rewrites the CLI scripts to the installed bin and drops the ones that ran what went', () => {
    eject()

    const { scripts } = JSON.parse(fixture.read('package.json'))
    expect(scripts.gen).toBe('vuestrata')
    expect(scripts['gen:module']).toBe('vuestrata add module')
    expect(scripts.doctor).toBe('vuestrata doctor')
    expect(scripts.lint).toBe('vp lint && node scripts/docs/check-links.mjs --quiet')
    expect(scripts['test:e2e']).toBe('playwright test')
    for (const name of ['lint:maintainer', 'version:show', 'release:verify', 'cli:payload']) {
      expect(scripts, name).not.toHaveProperty(name)
    }
  })

  it('drops the cli-roundtrip job, and its entry in the gate that waits on it', () => {
    eject()

    const workflow = fixture.read('.github/workflows/ci.yml')
    expect(workflow).not.toContain('cli-roundtrip')
    expect(workflow).not.toContain('packages/cli')
    expect(workflow).toContain('ci-ok:')
    expect(workflow).toMatch(/needs: \[[^\]]*\bdocker\b[^\]]*\]/)
  })
})

describe('eject and the documentation', () => {
  it('points relative docs/ links at the tagged upstream copy', () => {
    eject()

    const base = 'https://github.com/boussadjra/vuestrata'
    const readme = fixture.read('README.md')
    expect(readme).toContain(`](${base}/blob/v1.0.0/docs/index.md)`)
    expect(readme).toContain(`](${base}/blob/v1.0.0/docs/9.readiness.md#the-demo)`)
    expect(readme).toContain(`](${base}/tree/v1.0.0/docs/9.recipes/)`)
    expect(readme).toContain('[`docs/9.readiness.md`]')
    expect(readme.replace(/```[\s\S]*?```/g, '')).not.toMatch(/\]\((?:\.\/)?docs\//)
    // A code fence is an example, not a reference.
    expect(readme).toContain('[left alone](docs/index.md) inside a fence')

    expect(fixture.read('CONTRIBUTING.md')).toContain(
      `${base}/blob/v1.0.0/docs/2.architecture/4.route-pages.md`,
    )
    expect(fixture.read('SECURITY.md')).toContain(`${base}/blob/v1.0.0/docs/9.readiness.md`)
  })

  it('leaves docs/ and every link into it alone with --keep-docs', () => {
    eject({ 'keep-docs': true })

    expect(fixture.exists('docs/index.md')).toBe(true)
    expect(fixture.read('README.md')).toBe(README)
  })

  it('drops the not-found page link to the docs it removed', () => {
    eject()
    expect(fixture.read('src/modules/app/pages/[...notfound].vue')).not.toContain('to="/docs"')
  })

  it('writes the placeholder home route', () => {
    eject()
    expect(fixture.read('src/modules/app/pages/index.vue')).toContain(
      "router.replace('/dashboard')",
    )
  })
})

describe('eject and the docs-only dependencies', () => {
  it('prunes them, the vendored tarball and the Dockerfile COPY that carried it', () => {
    eject()

    const pkg = JSON.parse(fixture.read('package.json'))
    for (const name of ['axe-core', 'shiki', '@shikijs/langs', 'beautiful-mermaid', 'comark']) {
      expect(pkg.dependencies, name).not.toHaveProperty(name)
    }
    expect(pkg.dependencies.vue).toBe('^3.5.0')
    // Not docs-only: the Playwright adapter is what the e2e specs run axe with.
    expect(pkg.devDependencies).toHaveProperty('@axe-core/playwright')

    expect(fixture.exists('vendor')).toBe(false)
    const dockerfile = fixture.read('Dockerfile')
    expect(dockerfile).not.toContain('vendor')
    expect(dockerfile).toContain('COPY package.json')
  })

  it('keeps one a remaining file still imports', () => {
    fixture.write('src/modules/app/lib/highlight.ts', "import { codeToHtml } from 'shiki'\n")
    eject()

    const pkg = JSON.parse(fixture.read('package.json'))
    expect(pkg.dependencies).toHaveProperty('shiki')
    expect(pkg.dependencies).not.toHaveProperty('axe-core')
  })
})

describe('the helpers behind it', () => {
  it('rewrites only markdown links and inline-code paths into docs/', () => {
    const out = rewriteDocLinks(
      'See [x](docs/a.md#b), [y](./docs/), `docs/c.md`, [z](other.md).',
      'v2',
    )
    expect(out).toBe(
      'See [x](https://github.com/boussadjra/vuestrata/blob/v2/docs/a.md#b), ' +
        '[y](https://github.com/boussadjra/vuestrata/tree/v2/docs/), ' +
        '[`docs/c.md`](https://github.com/boussadjra/vuestrata/blob/v2/docs/c.md), [z](other.md).',
    )
  })

  it('reports no cli-roundtrip job when there is none to drop', () => {
    expect(dropCliRoundtrip('jobs:\n  lint:\n    runs-on: x\n')).toBeUndefined()
  })
})
