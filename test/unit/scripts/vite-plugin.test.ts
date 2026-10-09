import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  build as viteBuild,
  resolveConfig,
  type ConfigEnv,
  type ConfigPluginContext,
  type Connect,
  type HtmlTagDescriptor,
  type IndexHtmlTransformContext,
  type MinimalPluginContextWithoutEnvironment,
  type Plugin,
  type PreviewServer,
  type ViteDevServer,
} from 'vite-plus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { z } from 'zod'

// @ts-expect-error - the header scripts are plain ESM JavaScript with no type declarations.
import { buildCsp } from '../../../scripts/security/headers.mjs'
import {
  describeUndeclaredAdapters,
  readAuthAdapters,
  scanAuthAdapters,
  scanAuthConfig,
  vuestrataEnv,
  type VuestrataEnvOptions,
} from '../../../scripts/vite/vuestrata-plugin.mjs'

/**
 * The Vite plugin is where the env schema meets the build: it decides what
 * `__VUESTRATA_DEMO__` compiles to, and — under `vp dev` — whether requests for
 * the API path are proxied to `DEV_API_TARGET`. It is also what makes every
 * page load `runtime-config.js` before the app, and what holds the project's
 * own `deploy.config.ts` to the same standard as the built-in variables.
 *
 * That variable is the one thing here with a security edge. It is read from
 * the same `.env` files as everything else, and every `VUESTRATA_*` value in
 * those files is inlined into the client bundle. `DEV_API_TARGET` must never
 * follow them there.
 *
 * Each test builds a throwaway project root with real `.env` files, so the
 * plugin reads them the way Vite does — including the mode-specific
 * `.env.development.local` the docs recommend.
 */

const TARGET = 'http://127.0.0.1:18408'

const production = {
  VUESTRATA_RUNTIME_MODE: 'production',
  VUESTRATA_USE_MOCKS: 'false',
  VUESTRATA_AUTH_ADAPTER: 'jwt',
}

const roots: string[] = []

/** A project root holding the given `.env*` files. */
function project(files: Record<string, Record<string, string>>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-plugin-'))
  roots.push(root)
  for (const [name, vars] of Object.entries(files)) {
    const lines = Object.entries(vars).map(([key, value]) => `${key}=${value}`)
    fs.writeFileSync(path.join(root, name), `${lines.join('\n')}\n`)
  }
  return root
}

/** Runs the plugin's `config` hook the way Vite does, capturing warnings. */
async function runConfig(root: string, env: ConfigEnv, options?: VuestrataEnvOptions) {
  const plugin = vuestrataEnv(options)
  const warn = vi.fn()
  const hook = plugin.config
  const handler = typeof hook === 'function' ? hook : hook?.handler
  if (!handler) throw new Error('vuestrata:env has no config hook')

  const result = await handler.call({ warn } as unknown as ConfigPluginContext, { root }, env)
  return { plugin, result: result ?? {}, warn }
}

const serve = (mode = 'development'): ConfigEnv => ({ command: 'serve', mode })
const build = (mode = 'production'): ConfigEnv => ({ command: 'build', mode })

async function transformHtml(
  plugin: Plugin,
  html: string,
  ctx: Partial<IndexHtmlTransformContext>,
) {
  const hook = plugin.transformIndexHtml
  const handler = typeof hook === 'function' ? hook : hook?.handler
  if (!handler) throw new Error('vuestrata:env has no transformIndexHtml hook')

  return handler.call({} as MinimalPluginContextWithoutEnvironment, html, {
    path: '/index.html',
    filename: 'index.html',
    ...ctx,
  })
}

beforeEach(() => {
  // A developer's shell may export any of these; the tests must not see them.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('VUESTRATA_') || key === 'DEV_API_TARGET' || key === 'DEV_PROXY_PATHS') {
      vi.stubEnv(key, undefined)
    }
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('the dev API proxy', () => {
  it('proxies a same-origin API path to DEV_API_TARGET under vp dev', async () => {
    const root = project({
      '.env.development.local': {
        ...production,
        VUESTRATA_API_URL: '/api',
        DEV_API_TARGET: TARGET,
      },
    })

    const { result, warn } = await runConfig(root, serve())

    expect(Object.values(result.server?.proxy ?? {})).toEqual([
      {
        target: TARGET,
        changeOrigin: true,
        xfwd: true,
        ws: true,
        // Strips `Domain` so a session cookie lands on the dev server's host.
        cookieDomainRewrite: '',
      },
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([
    ['no DEV_API_TARGET', { VUESTRATA_API_URL: '/api' }],
    [
      'an absolute API URL',
      { VUESTRATA_API_URL: 'http://localhost:8000/api', DEV_API_TARGET: TARGET },
    ],
  ])('configures no proxy with %s', async (_, vars) => {
    const root = project({ '.env.development.local': { ...production, ...vars } })

    const { result } = await runConfig(root, serve())

    expect(result.server).toBeUndefined()
  })

  it('configures no proxy in a build, even with DEV_API_TARGET set for every mode', async () => {
    const root = project({
      '.env': { ...production, VUESTRATA_API_URL: '/api', DEV_API_TARGET: TARGET },
    })

    const { result, warn } = await runConfig(root, build())

    expect(result.server).toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })

  it('configures no proxy under vp preview, which inherits server.proxy by default', async () => {
    const root = project({
      '.env': { ...production, VUESTRATA_API_URL: '/api', DEV_API_TARGET: TARGET },
    })

    const resolved = await resolveConfig(
      { configFile: false, root, logLevel: 'silent', plugins: [vuestrataEnv()] },
      'serve',
      'production',
      'production',
      true,
    )

    expect(JSON.stringify(resolved.preview.proxy ?? null)).not.toContain(TARGET)
  })

  it('warns once, naming both variables, when DEV_API_TARGET cannot apply', async () => {
    const root = project({
      '.env.development.local': {
        ...production,
        VUESTRATA_API_URL: 'http://localhost:8000/api',
        DEV_API_TARGET: TARGET,
      },
    })

    const { warn } = await runConfig(root, serve())

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/DEV_API_TARGET is set, but VUESTRATA_API_URL=.* is absolute/),
    )
  })

  it('also refuses to proxy the site root, which would swallow the app', async () => {
    const root = project({
      '.env.development.local': { ...production, VUESTRATA_API_URL: '/', DEV_API_TARGET: TARGET },
    })

    const { result, warn } = await runConfig(root, serve())

    expect(result.server).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/site root/))
  })

  it('matches the API path at a segment boundary only', async () => {
    const root = project({
      '.env.development.local': {
        ...production,
        VUESTRATA_API_URL: '/api/v1/',
        DEV_API_TARGET: TARGET,
      },
    })

    const { result } = await runConfig(root, serve())
    const [key] = Object.keys(result.server?.proxy ?? {})
    // Vite treats a key starting with `^` as a RegExp against the request URL.
    expect(key?.startsWith('^')).toBe(true)
    const matches = (url: string) => new RegExp(key!).test(url)

    expect(['/api/v1', '/api/v1/users', '/api/v1/users/7', '/api/v1?page=2'].every(matches)).toBe(
      true,
    )
    expect(['/api/v10', '/api/v1-docs', '/api', '/src/api/v1.ts'].some(matches)).toBe(false)
  })

  it('reads DEV_API_TARGET from the shell as well as from .env files', async () => {
    vi.stubEnv('DEV_API_TARGET', TARGET)
    const root = project({ '.env.development.local': { ...production, VUESTRATA_API_URL: '/api' } })

    const { result } = await runConfig(root, serve())

    expect(JSON.stringify(result.server?.proxy)).toContain(TARGET)
  })

  it('rejects a DEV_API_TARGET that is not an absolute http(s) URL', async () => {
    const root = project({
      '.env.development.local': {
        ...production,
        VUESTRATA_API_URL: '/api',
        DEV_API_TARGET: 'localhost:8000',
      },
    })

    await expect(runConfig(root, serve())).rejects.toThrow(
      /DEV_API_TARGET must be an absolute http\(s\) URL/,
    )
  })
})

describe('the backend routes beside the API (DEV_PROXY_PATHS)', () => {
  const RULE = {
    target: TARGET,
    changeOrigin: true,
    xfwd: true,
    ws: true,
    cookieDomainRewrite: '',
  }

  /** The proxy rule a request URL falls under, by the key Vite would match. */
  function ruleFor(proxy: Record<string, unknown> | undefined, url: string): string | undefined {
    return Object.keys(proxy ?? {}).find((key) => new RegExp(key).test(url))
  }

  it('forwards each listed path to DEV_API_TARGET, with the options the API path gets', async () => {
    const root = project({
      '.env.development.local': {
        ...production,
        VUESTRATA_API_URL: '/api',
        DEV_API_TARGET: TARGET,
        DEV_PROXY_PATHS: '/login,/logout, /sanctum/',
      },
    })

    const { result, warn } = await runConfig(root, serve())
    const proxy = result.server?.proxy as Record<string, unknown>

    expect(Object.values(proxy)).toEqual([RULE, RULE, RULE, RULE])
    for (const url of ['/api/user', '/login', '/logout', '/sanctum/csrf-cookie', '/login?next=1']) {
      expect(ruleFor(proxy, url), url).toBeDefined()
    }
    expect(warn).not.toHaveBeenCalled()
  })

  it('matches each path at a segment boundary, so the app keeps its own routes', async () => {
    const root = project({
      '.env.development.local': {
        ...production,
        VUESTRATA_API_URL: '/api',
        DEV_API_TARGET: TARGET,
        DEV_PROXY_PATHS: '/login',
      },
    })

    const { result } = await runConfig(root, serve())
    const proxy = result.server?.proxy as Record<string, unknown>

    for (const url of [
      '/',
      '/auth/login',
      '/login-help',
      '/loginx',
      '/src/login.ts',
      '/dashboard',
    ]) {
      expect(ruleFor(proxy, url), url).toBeUndefined()
    }
  })

  it('adds no rule for a path the API proxy already covers', async () => {
    const root = project({
      '.env.development.local': {
        ...production,
        VUESTRATA_API_URL: '/api',
        DEV_API_TARGET: TARGET,
        DEV_PROXY_PATHS: '/api,/api/auth,/login,/login',
      },
    })

    const { result } = await runConfig(root, serve())

    expect(Object.values(result.server?.proxy ?? {})).toEqual([RULE, RULE])
  })

  it('reads the list from the shell as well as from .env files', async () => {
    vi.stubEnv('DEV_PROXY_PATHS', '/login')
    const root = project({
      '.env.development.local': {
        ...production,
        VUESTRATA_API_URL: '/api',
        DEV_API_TARGET: TARGET,
      },
    })

    const { result } = await runConfig(root, serve())

    expect(ruleFor(result.server?.proxy as Record<string, unknown>, '/login')).toBeDefined()
  })

  it('says so, and proxies nothing, when there is no DEV_API_TARGET to forward to', async () => {
    const root = project({
      '.env.development.local': {
        ...production,
        VUESTRATA_API_URL: '/api',
        DEV_PROXY_PATHS: '/login',
      },
    })

    const { result, warn } = await runConfig(root, serve())

    expect(result.server).toBeUndefined()
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/DEV_PROXY_PATHS is set, but DEV_API_TARGET is not/),
    )
  })

  it('proxies nothing for an absolute API URL, which the browser calls directly', async () => {
    const root = project({
      '.env.development.local': {
        ...production,
        VUESTRATA_API_URL: 'http://localhost:8000/api',
        DEV_API_TARGET: TARGET,
        DEV_PROXY_PATHS: '/login',
      },
    })

    const { result, warn } = await runConfig(root, serve())

    expect(result.server).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it.each([
    '/',
    'login',
    '//evil.example/login',
    '/login?x=1',
    '/log*',
    'http://localhost:8000/login',
  ])('refuses %s, which is not a path of its own under the site root', async (value) => {
    const root = project({
      '.env.development.local': {
        ...production,
        VUESTRATA_API_URL: '/api',
        DEV_API_TARGET: TARGET,
        DEV_PROXY_PATHS: value,
      },
    })

    await expect(runConfig(root, serve())).rejects.toThrow(/DEV_PROXY_PATHS must be/)
  })

  it('configures nothing in a build, and never reaches the bundle', async () => {
    const root = project({
      '.env': {
        ...production,
        VUESTRATA_API_URL: '/api',
        DEV_API_TARGET: TARGET,
        DEV_PROXY_PATHS: '/login,/sanctum',
      },
    })

    const { result, warn } = await runConfig(root, build())

    expect(result.server).toBeUndefined()
    expect(JSON.stringify(result.define)).not.toMatch(/DEV_PROXY_PATHS|sanctum/)
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('DEV_API_TARGET never reaches the bundle', () => {
  it('is not part of the define the plugin returns', async () => {
    const root = project({
      '.env.development.local': {
        ...production,
        VUESTRATA_API_URL: '/api',
        DEV_API_TARGET: TARGET,
      },
    })

    const { result } = await runConfig(root, serve())

    expect(JSON.stringify(result.define)).not.toMatch(/DEV_API_TARGET|18408/)
  })

  it.each([
    ['vp dev', 'serve', 'development'],
    ['a build', 'build', 'production'],
  ] as const)(
    'is absent from import.meta.env and define once %s resolves the config',
    async (_, command, mode) => {
      const root = project({
        '.env': { ...production, VUESTRATA_API_URL: '/api', DEV_API_TARGET: TARGET },
      })

      const resolved = await resolveConfig(
        // The prefix vite.config.ts sets: the only variables Vite exposes.
        {
          configFile: false,
          root,
          envPrefix: 'VUESTRATA_',
          logLevel: 'silent',
          plugins: [vuestrataEnv()],
        },
        command,
        mode,
      )

      // `resolved.env` is exactly what `import.meta.env` is built from.
      expect(resolved.env.VUESTRATA_API_URL).toBe('/api')
      const exposed = JSON.stringify({ env: resolved.env, define: resolved.define })
      expect(exposed).not.toMatch(/DEV_API_TARGET|18408/)

      // Proves the value was really loaded under `vp dev`, so the absence above
      // means something — and that a build never reads it at all.
      expect(JSON.stringify(resolved.server.proxy ?? null).includes(TARGET)).toBe(
        command === 'serve',
      )
    },
  )
})

describe('the build target', () => {
  it.each([
    {
      name: 'a demo build',
      vars: { VUESTRATA_RUNTIME_MODE: 'demo' },
      env: build(),
      demo: 'true',
      sourcemap: 'hidden',
    },
    {
      name: 'a production build',
      vars: { ...production, VUESTRATA_API_URL: '/api' },
      env: build(),
      demo: 'false',
      sourcemap: false,
    },
    // Forced on under test so demo-state suites keep working.
    {
      name: 'production under test',
      vars: { ...production, VUESTRATA_API_URL: '/api' },
      env: serve('test'),
      demo: 'true',
      sourcemap: false,
    },
  ] as const)(
    'compiles $name with __VUESTRATA_DEMO__=$demo and sourcemap=$sourcemap',
    async ({ vars, env, demo, sourcemap }) => {
      const root = project({ '.env': vars })

      const { result } = await runConfig(root, env)

      expect(result.define).toEqual({
        __VUESTRATA_DEMO__: demo,
        // No auth.config.ts in this root, so no adapter of the project's own.
        __VUESTRATA_AUTH_ADAPTERS__: '{}',
        // None of these builds selected the cookie-session adapter.
        __VUESTRATA_SESSION_ADAPTER__: 'false',
      })
      expect(result.build).toEqual({ sourcemap })
    },
  )

  it.each([
    ['a build', build()],
    ['vp dev', serve()],
  ])('compiles the session adapter in for %s that selects it, and only then', async (_, env) => {
    const selected = project({
      '.env': {
        ...production,
        VUESTRATA_AUTH_ADAPTER: 'session',
        VUESTRATA_SESSION_PERSISTENCE: 'none',
        VUESTRATA_API_URL: '/api',
      },
    })
    const other = project({
      // The default build: the jwt adapter.
      '.env': { ...production, VUESTRATA_API_URL: '/api' },
    })

    expect((await runConfig(selected, env)).result.define?.__VUESTRATA_SESSION_ADAPTER__).toBe(
      'true',
    )
    expect((await runConfig(other, env)).result.define?.__VUESTRATA_SESSION_ADAPTER__).toBe('false')
  })

  it('leaves it out under test, where the registry is tested as the build it describes', async () => {
    const root = project({ '.env': {} })

    const { result } = await runConfig(root, serve('test'))

    expect(result.define?.__VUESTRATA_SESSION_ADAPTER__).toBe('false')
  })

  it('accepts a local backend URL under vp dev but still fails a build with it', async () => {
    const root = project({
      '.env': { ...production, VUESTRATA_API_URL: 'http://localhost:8000/api' },
    })

    await expect(runConfig(root, serve())).resolves.toBeDefined()
    await expect(runConfig(root, build())).rejects.toThrow(/placeholder host "localhost"/)
  })

  it('validates the env files of the project root it is given', async () => {
    const root = project({ '.env': { VUESTRATA_AUTH_ADAPTER: 'saml' } })

    await expect(runConfig(root, build())).rejects.toThrow(/Invalid environment configuration/)
  })
})

/**
 * `VUESTRATA_MOCK_ONLY`: a demo build in what it bundles (MSW and the mock
 * handlers must be compiled in), with a real adapter and a real backend. The
 * plugin adds no constant for it. `__VUESTRATA_DEMO__` goes on meaning "the
 * mocks are in the bundle", which is what every module barrel reads it for.
 */
describe('a build that mocks some modules beside a real backend', () => {
  const hybrid = {
    VUESTRATA_RUNTIME_MODE: 'demo',
    VUESTRATA_AUTH_ADAPTER: 'jwt',
    VUESTRATA_API_URL: '/api',
    VUESTRATA_MOCK_ONLY: 'orders,reports',
  }

  it.each([
    ['a build', build()],
    ['vp dev', serve()],
  ])(
    'compiles the mocks in for %s, with the defines of a demo build and no other',
    async (_, env) => {
      const root = project({ '.env': hybrid })

      const { result, warn } = await runConfig(root, env)

      expect(result.define).toEqual({
        __VUESTRATA_DEMO__: 'true',
        __VUESTRATA_AUTH_ADAPTERS__: '{}',
      })
      expect(result.build).toEqual({ sourcemap: 'hidden' })
      expect(warn).not.toHaveBeenCalled()
    },
  )

  it('fails a production build that sets the variable, naming it', async () => {
    const root = project({
      '.env': { ...production, VUESTRATA_API_URL: '/api', VUESTRATA_MOCK_ONLY: 'orders' },
    })

    await expect(runConfig(root, build())).rejects.toThrow(
      /VUESTRATA_MOCK_ONLY is not valid when VUESTRATA_RUNTIME_MODE="production"\. MSW and the mock handlers are not bundled/,
    )
  })

  it('fails a build that sets it and leaves the mode to default, which is production', async () => {
    const root = project({ '.env': { VUESTRATA_API_URL: '/api', VUESTRATA_MOCK_ONLY: 'orders' } })

    await expect(runConfig(root, build())).rejects.toThrow(/VUESTRATA_MOCK_ONLY is not valid/)
  })

  it('refuses it under vp dev in production mode too: MSW is compiled out there as well', async () => {
    const root = project({
      '.env.development.local': {
        ...production,
        VUESTRATA_API_URL: '/api',
        VUESTRATA_MOCK_ONLY: 'orders',
      },
    })

    await expect(runConfig(root, serve())).rejects.toThrow(/VUESTRATA_MOCK_ONLY is not valid/)
  })

  it.each([
    ['the mock adapter', { VUESTRATA_AUTH_ADAPTER: 'mock' }, /needs a real auth adapter/],
    ['"auth" in the list', { VUESTRATA_MOCK_ONLY: 'orders,auth' }, /cannot name "auth"/],
    [
      'a malformed id',
      { VUESTRATA_MOCK_ONLY: 'Orders' },
      /VUESTRATA_MOCK_ONLY: expected module ids/,
    ],
    ['mocks switched off', { VUESTRATA_USE_MOCKS: 'false' }, /VUESTRATA_USE_MOCKS must be "true"/],
  ])('fails the build for %s', async (_, vars, message) => {
    const root = project({ '.env': { ...hybrid, ...vars } })

    await expect(runConfig(root, build())).rejects.toThrow(message)
  })

  it('still proxies the API path under vp dev: MSW answers first, in the browser', async () => {
    const root = project({ '.env.development.local': { ...hybrid, DEV_API_TARGET: TARGET } })

    const { result, warn } = await runConfig(root, serve())

    expect(Object.values(result.server?.proxy ?? {})).toEqual([
      expect.objectContaining({ target: TARGET, changeOrigin: true }),
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it('holds a build to a real API URL, and lets vp dev point at a local backend', async () => {
    const root = project({ '.env': { ...hybrid, VUESTRATA_API_URL: 'http://localhost:8000' } })

    await expect(runConfig(root, serve())).resolves.toBeDefined()
    await expect(runConfig(root, build())).rejects.toThrow(
      /not usable with a real backend: .*placeholder host "localhost"/,
    )
  })

  it('accepts an adapter the project registered as the real one', async () => {
    const root = project({ '.env': { ...hybrid, VUESTRATA_AUTH_ADAPTER: 'acme' } })
    fs.mkdirSync(path.join(root, 'src/modules/app/config'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'src/modules/app/config/auth.config.ts'),
      [
        'export default defineAuthConfig({ adapters: { acme: () => ({}) } })',
        "declare module '~/lib/auth' {",
        '  interface RegisteredAuthAdapterNames {',
        '    acme: true',
        '  }',
        '}',
        '',
      ].join('\n'),
    )

    const { result } = await runConfig(root, build())

    expect(result.define).toMatchObject({ __VUESTRATA_DEMO__: 'true' })
  })

  describe('in a real build', () => {
    async function buildWith(vars: Record<string, string>) {
      const root = project({ '.env': vars })
      fs.writeFileSync(
        path.join(root, 'index.html'),
        '<!doctype html><html><head><title>t</title></head><body><div id="app"></div>' +
          '<script type="module" src="/main.js"></script></body></html>',
      )
      fs.writeFileSync(path.join(root, 'main.js'), 'document.title = String(Date.now())\n')
      fs.mkdirSync(path.join(root, 'public'))
      fs.writeFileSync(path.join(root, 'public/mockServiceWorker.js'), '/* msw */\n')

      await viteBuild({
        configFile: false,
        root,
        logLevel: 'silent',
        envPrefix: 'VUESTRATA_',
        plugins: [vuestrataEnv()],
      })
      return path.join(root, 'dist')
    }

    it('publishes the mock service worker, which a production build removes', async () => {
      const dist = await buildWith(hybrid)
      expect(fs.existsSync(path.join(dist, 'mockServiceWorker.js'))).toBe(true)

      const productionDist = await buildWith({ ...production, VUESTRATA_API_URL: '/api' })
      expect(fs.existsSync(path.join(productionDist, 'mockServiceWorker.js'))).toBe(false)
    })
  })
})

describe('the runtime configuration script', () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')

  /** The plugin after Vite resolved a config for `root`, so it knows `base`. */
  async function resolved(root: string, config: { base?: string } = {}) {
    const plugin = vuestrataEnv()
    await resolveConfig(
      { configFile: false, root, logLevel: 'silent', plugins: [plugin], ...config },
      'build',
      'production',
    )
    return plugin
  }

  /** The page as the plugin leaves it. */
  async function page(
    plugin: Plugin,
    ctx: Partial<IndexHtmlTransformContext> = {},
    html = indexHtml,
  ) {
    return (await transformHtml(plugin, html, ctx)) as string
  }

  /** Every `<script>` opening tag of a page that has a `src`. */
  const scriptTags = (html: string) => html.match(/<script\b[^>]*\bsrc="[^"]*"[^>]*>/g) ?? []

  it('is loaded by every page, as a separate classic script', async () => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })

    const html = await page(await resolved(root))

    // No `type="module"` and no `defer`/`async`: a classic script runs before
    // any module script, and the app reads the values while its modules are
    // evaluated. No children: an inline copy could not differ per deployment,
    // and `script-src 'self'` would refuse it.
    expect(html).toContain('<script src="/runtime-config.js"></script>')
    expect(scriptTags(html).filter((tag) => tag.includes('runtime-config.js'))).toEqual([
      '<script src="/runtime-config.js">',
    ])
    // Nothing else about the page changed.
    expect(html.replace(/\n *<script src="\/runtime-config\.js"><\/script>/, '')).toBe(indexHtml)
  })

  it('comes after the charset and the CSP tag, and before the app', async () => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })

    const html = await page(await resolved(root))
    const charset = html.search(/<meta\s+charset=/)
    const policy = html.search(/<meta\s+http-equiv="Content-Security-Policy"/)
    const config = html.indexOf('<script src="/runtime-config.js">')
    const app = html.search(/<script[^>]+type="module"/)

    // A policy in a <meta> governs only what follows it: ahead of the tag,
    // the script would load outside the page's own policy.
    expect(charset).toBeGreaterThanOrEqual(0)
    expect(charset).toBeLessThan(policy)
    expect(policy).toBeLessThan(config)
    expect(config).toBeLessThan(app)
    // Directly after the tag, on a line of its own.
    expect(html).toMatch(
      /http-equiv="Content-Security-Policy"[^>]*>\n {4}<script src="\/runtime-config\.js"><\/script>\n/,
    )
  })

  it('goes after the charset on a page with no CSP tag', async () => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })
    const bare =
      '<!doctype html><html><head><meta charset="UTF-8" /><title>t</title></head><body></body></html>'

    expect(await page(await resolved(root), {}, bare)).toBe(
      bare.replace(
        '<meta charset="UTF-8" />',
        '<meta charset="UTF-8" />\n<script src="/runtime-config.js"></script>',
      ),
    )
  })

  it('goes first on a page with neither', async () => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })
    const bare = '<html><head><title>t</title></head><body></body></html>'

    const result = (await transformHtml(await resolved(root), bare, {})) as {
      html: string
      tags: HtmlTagDescriptor[]
    }

    expect(result.html).toBe(bare)
    expect(result.tags).toEqual([
      { tag: 'script', attrs: { src: '/runtime-config.js' }, injectTo: 'head-prepend' },
    ])
  })

  it('is the same under vp dev, so development behaves like the build', async () => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })
    const plugin = await resolved(root)

    expect(await page(plugin, { server: {} as ViteDevServer })).toBe(await page(plugin))
  })

  it.each([
    ['/', '/runtime-config.js'],
    ['/console/', '/console/runtime-config.js'],
    ['https://cdn.acme.test/app/', 'https://cdn.acme.test/app/runtime-config.js'],
  ])("follows Vite's base %s", async (base, src) => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })

    const html = await page(await resolved(root, { base }))

    expect(html).toContain(`<script src="${src}"></script>`)
  })

  describe('in a real build', () => {
    /** The smallest project Vite can build: a page and the module it loads. */
    function buildable(files: Record<string, string> = {}): string {
      const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })
      fs.writeFileSync(
        path.join(root, 'index.html'),
        '<!doctype html><html><head><title>t</title></head><body><div id="app"></div>' +
          '<script type="module" src="/main.js"></script></body></html>',
      )
      fs.writeFileSync(path.join(root, 'main.js'), 'document.title = String(Date.now())\n')
      for (const [name, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
        fs.writeFileSync(path.join(root, name), content)
      }
      return root
    }

    const buildIn = (root: string, base?: string) =>
      viteBuild({
        configFile: false,
        root,
        base,
        logLevel: 'silent',
        envPrefix: 'VUESTRATA_',
        plugins: [vuestrataEnv()],
      })

    const read = (root: string, file: string) => fs.readFileSync(path.join(root, file), 'utf8')

    it('references the file from the page and never inlines it', async () => {
      const root = buildable({
        'public/runtime-config.js': 'window.__VUESTRATA_RUNTIME__ ||= {} // MARKER\n',
      })

      await buildIn(root)
      const html = read(root, 'dist/index.html')

      expect(html).toContain('<script src="/runtime-config.js"></script>')
      // Ahead of the app's module script in the document, which Vite moved
      // into <head> while bundling.
      expect(html.indexOf('/runtime-config.js')).toBeLessThan(html.indexOf('type="module"'))
      expect(html).toMatch(/<head>[\s\S]*type="module"[\s\S]*<\/head>/)
      // Still its own file, byte for byte: a deployment replaces it without a rebuild.
      expect(html).not.toContain('MARKER')
      expect(html).not.toContain('__VUESTRATA_RUNTIME__')
      expect(read(root, 'dist/runtime-config.js')).toBe(
        'window.__VUESTRATA_RUNTIME__ ||= {} // MARKER\n',
      )
      // And no bundled chunk took a copy either.
      for (const asset of fs.readdirSync(path.join(root, 'dist/assets'))) {
        expect(read(root, `dist/assets/${asset}`)).not.toContain('MARKER')
      }
    }, 60_000)

    it('emits an empty overlay when the project has no copy in public/', async () => {
      const root = buildable()

      await buildIn(root)

      // Otherwise the page's first script would be a 404 — or, behind an SPA
      // fallback, index.html parsed as JavaScript.
      expect(read(root, 'dist/runtime-config.js')).toBe('window.__VUESTRATA_RUNTIME__ ||= {}\n')
    }, 60_000)

    it('prefixes the script with a subpath base', async () => {
      const root = buildable()

      await buildIn(root, '/console/')

      expect(read(root, 'dist/index.html')).toContain(
        '<script src="/console/runtime-config.js"></script>',
      )
    }, 60_000)
  })

  describe('under vp dev, for a project with no copy in public/', () => {
    /** The middleware the plugin registers, for a dev server rooted at `root`. */
    async function middleware(root: string) {
      const plugin = await resolved(root)
      const use = vi.fn<(handler: Connect.NextHandleFunction) => void>()
      const hook = plugin.configureServer
      const handler = typeof hook === 'function' ? hook : hook?.handler
      if (!handler) throw new Error('vuestrata:env has no configureServer hook')
      await handler.call(
        {} as MinimalPluginContextWithoutEnvironment,
        { middlewares: { use } } as unknown as ViteDevServer,
      )
      return use.mock.calls[0]![0]
    }

    function request(handler: Connect.NextHandleFunction, url: string) {
      const response = { setHeader: vi.fn(), end: vi.fn() }
      const next = vi.fn()
      handler({ url } as Connect.IncomingMessage, response as never, next)
      return { response, next }
    }

    it('answers with an empty overlay, uncached', async () => {
      const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })

      const { response, next } = request(await middleware(root), '/runtime-config.js?t=1')

      expect(next).not.toHaveBeenCalled()
      expect(response.end).toHaveBeenCalledWith('window.__VUESTRATA_RUNTIME__ ||= {}\n')
      expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/javascript')
      expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    })

    it('leaves the file in public/ to Vite when there is one', async () => {
      const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })
      fs.mkdirSync(path.join(root, 'public'))
      fs.writeFileSync(path.join(root, 'public/runtime-config.js'), '// the project copy\n')

      const { response, next } = request(await middleware(root), '/runtime-config.js')

      expect(next).toHaveBeenCalledTimes(1)
      expect(response.end).not.toHaveBeenCalled()
    })

    it('answers nothing else', async () => {
      const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })
      const handler = await middleware(root)

      for (const url of [
        '/',
        '/src/main.ts',
        '/assets/runtime-config.js',
        '/runtime-config.json',
      ]) {
        const { response, next } = request(handler, url)
        expect(next, url).toHaveBeenCalledTimes(1)
        expect(response.end, url).not.toHaveBeenCalled()
      }
    })
  })
})

describe('the Content Security Policy of a served app', () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')
  const CROSS_ORIGIN_API = 'http://localhost:8000/api'

  const metaPolicy = (html: string) =>
    /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)?.[1] ?? ''
  const sources = (policy: string, name: string) =>
    policy
      .split('; ')
      .map((entry) => entry.split(' '))
      .find(([entry]) => entry === name)
      ?.slice(1)

  /** The plugin once Vite resolved a config for `vp dev` or `vp preview`. */
  async function served(
    root: string,
    {
      preview = false,
      mode = preview ? 'production' : 'development',
      deployConfig,
    }: {
      preview?: boolean
      mode?: string
      deployConfig?: VuestrataEnvOptions['deployConfig']
    } = {},
  ) {
    const plugin = vuestrataEnv(deployConfig ? { deployConfig } : undefined)
    await resolveConfig(
      { configFile: false, root, logLevel: 'silent', envPrefix: 'VUESTRATA_', plugins: [plugin] },
      'serve',
      mode,
      mode,
      preview,
    )
    return plugin
  }

  /** A dev server answering on these addresses. */
  const devServer = (local = ['http://localhost:3449/'], network: string[] = []) => {
    const use = vi.fn<(handler: Connect.NextHandleFunction) => void>()
    const server = { middlewares: { use }, resolvedUrls: { local, network } }
    return { server: server as unknown as ViteDevServer, use }
  }

  /** The headers a middleware sets on a response, and whether it passed the request on. */
  function respond(handler: Connect.NextHandleFunction, url = '/') {
    const headers = new Map<string, string>()
    const next = vi.fn()
    handler(
      { url } as Connect.IncomingMessage,
      { setHeader: (name: string, value: string) => headers.set(name, value) } as never,
      next,
    )
    return { headers, next }
  }

  async function devMiddlewares(plugin: Plugin, server: ViteDevServer) {
    const hook = plugin.configureServer
    const handler = typeof hook === 'function' ? hook : hook?.handler
    if (!handler) throw new Error('vuestrata:env has no configureServer hook')
    await handler.call({} as MinimalPluginContextWithoutEnvironment, server)
  }

  /** The policy `vp dev` sends on a response. */
  async function devHeader(plugin: Plugin, local?: string[], network?: string[], url = '/') {
    const { server, use } = devServer(local, network)
    await devMiddlewares(plugin, server)
    const { headers, next } = respond(use.mock.calls[0]![0], url)
    expect(next).toHaveBeenCalledTimes(1)
    return headers.get('Content-Security-Policy') ?? ''
  }

  /** The policy `vp preview` sends on a response. */
  async function previewHeader(plugin: Plugin, url = '/assets/app.js') {
    const use = vi.fn<(handler: Connect.NextHandleFunction) => void>()
    const hook = plugin.configurePreviewServer
    const handler = typeof hook === 'function' ? hook : hook?.handler
    if (!handler) throw new Error('vuestrata:env has no configurePreviewServer hook')
    await handler.call(
      {} as MinimalPluginContextWithoutEnvironment,
      { middlewares: { use } } as unknown as PreviewServer,
    )
    if (use.mock.calls.length === 0) return undefined
    const { headers, next } = respond(use.mock.calls[0]![0], url)
    expect(next).toHaveBeenCalledTimes(1)
    return headers.get('Content-Security-Policy')
  }

  const deployConfig = {
    headers: {
      connectSrc: ['https://login.acme.test'],
      connectSrcFromEnv: ['VUESTRATA_ERROR_REPORTING_DSN', 'REALTIME_URL'],
      websocketFromEnv: ['REALTIME_URL'],
      crossOriginOpenerPolicy: 'same-origin-allow-popups',
    },
  } as VuestrataEnvOptions['deployConfig']

  describe('under vp preview', () => {
    it('is the header a deployment would send, enforced', async () => {
      const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })

      const policy = await previewHeader(await served(root, { preview: true }))

      // Exactly the generator's, so a preview is held to what a deployment is.
      expect(policy).toBe(buildCsp({ apiUrl: '/api' }))
      expect(policy).toContain("frame-ancestors 'none'")
    })

    it('flags an origin nobody declared', async () => {
      // The defect this closes: with no policy sent, a request to an origin
      // missing from `connectSrc` worked in every preview and was blocked in
      // the first deployment that sends headers.
      const root = project({
        '.env': { ...production, VUESTRATA_API_URL: 'https://api.acme.test/v1' },
      })

      const policy = await previewHeader(await served(root, { preview: true, deployConfig }))

      expect(sources(policy ?? '', 'connect-src')).toEqual([
        "'self'",
        'https://login.acme.test',
        'https://api.acme.test',
      ])
      // Nothing wide: an undeclared origin matches no source, so the browser
      // blocks the request and reports it.
      expect(sources(policy ?? '', 'connect-src')).not.toContain('*')
      expect(policy).not.toMatch(/undeclared|https:(?!\/\/)/)
    })

    it('names the origins the environment names, from .env files too', async () => {
      const root = project({
        '.env': {
          ...production,
          VUESTRATA_API_URL: '/api',
          VUESTRATA_ERROR_REPORTING_DSN: 'https://key@o1.ingest.sentry.test/42',
          REALTIME_URL: 'https://rt.acme.test/socket',
        },
      })

      const policy = await previewHeader(await served(root, { preview: true, deployConfig }))

      expect(sources(policy ?? '', 'connect-src')).toEqual([
        "'self'",
        'https://login.acme.test',
        'https://o1.ingest.sentry.test',
        'https://rt.acme.test',
        'wss://rt.acme.test',
      ])
    })

    it('leaves the built page as the build wrote it', async () => {
      const root = project({ '.env': { ...production, VUESTRATA_API_URL: CROSS_ORIGIN_API } })
      const plugin = await served(root, { preview: true })

      const html = (await transformHtml(plugin, indexHtml, {})) as string

      // A preview serves a build: its tag is the generator's, as on a host.
      expect(metaPolicy(html)).toBe(metaPolicy(indexHtml))
    })
  })

  describe('under vp dev', () => {
    it('is the production policy plus the socket for hot updates, and nothing else', async () => {
      const root = project({
        '.env.development.local': { ...production, VUESTRATA_API_URL: '/api' },
      })

      const policy = await devHeader(await served(root))

      expect(policy).toBe(buildCsp({ apiUrl: '/api', extraOrigins: ['ws://localhost:3449'] }))
      // No eval, no inline script, no wildcard: Vite's client needs none.
      expect(sources(policy, 'script-src')).toEqual(["'self'"])
      expect(policy).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline|connect-src[^;]*\*/)
    })

    it('names every address the dev server answers on', async () => {
      const root = project({
        '.env.development.local': { ...production, VUESTRATA_API_URL: '/api' },
      })

      const policy = await devHeader(
        await served(root),
        ['http://localhost:3449/', 'http://127.0.0.1:3449/', 'http://[::1]:3449/'],
        ['https://192.168.1.20:3449/'],
      )

      expect(sources(policy, 'connect-src')).toEqual([
        "'self'",
        'ws://localhost:3449',
        'ws://127.0.0.1:3449',
        // An IPv6 literal cannot be a CSP source: 'self' covers it.
        'wss://192.168.1.20:3449',
      ])
    })

    it('allows the cross-origin API a developer points at, in the header and in the page', async () => {
      const root = project({
        '.env.development.local': { ...production, VUESTRATA_API_URL: CROSS_ORIGIN_API },
      })
      const plugin = await served(root)
      const { server } = devServer()

      const header = await devHeader(plugin)
      const html = (await transformHtml(plugin, indexHtml, { server })) as string

      // The committed tag says 'self'. A browser enforces it as well as the
      // header, so the served copy has to name the origin too.
      expect(sources(metaPolicy(indexHtml), 'connect-src')).toEqual(["'self'"])
      for (const policy of [header, metaPolicy(html)]) {
        expect(sources(policy, 'connect-src')).toEqual([
          "'self'",
          'http://localhost:8000',
          'ws://localhost:3449',
        ])
      }
      // The tag is the header without frame-ancestors.
      expect(metaPolicy(html)).toBe(header.replace("frame-ancestors 'none'; ", ''))
    })

    it('flags an origin nobody declared, as a deployment would', async () => {
      const root = project({
        '.env.development.local': { ...production, VUESTRATA_API_URL: '/api' },
      })
      const plugin = await served(root, { deployConfig })
      const { server } = devServer()

      const header = await devHeader(plugin)
      const html = (await transformHtml(plugin, indexHtml, { server })) as string

      for (const policy of [header, metaPolicy(html)]) {
        expect(sources(policy, 'connect-src')).toEqual([
          "'self'",
          'https://login.acme.test',
          'ws://localhost:3449',
        ])
      }
    })

    it('still loads the runtime configuration after the tag it rewrote', async () => {
      const root = project({
        '.env.development.local': { ...production, VUESTRATA_API_URL: CROSS_ORIGIN_API },
      })
      const { server } = devServer()

      const html = (await transformHtml(await served(root), indexHtml, { server })) as string

      expect(html).toMatch(
        /connect-src 'self' http:\/\/localhost:8000 ws:\/\/localhost:3449;[^>]*>\n {4}<script src="\/runtime-config\.js"><\/script>/,
      )
    })

    it('stops on an API URL no policy can name, rather than block every call later', async () => {
      const root = project({
        '.env.development.local': { ...production, VUESTRATA_API_URL: 'http://[::1]:8000/api' },
      })

      await expect(served(root)).rejects.toThrow(/VUESTRATA_API_URL.*is not an origin/)
    })
  })

  describe('in a build', () => {
    /** Build-time `transformIndexHtml`, with the warnings it raised. */
    async function builtPage(vars: Record<string, string>, html = indexHtml) {
      const root = project({ '.env': { ...production, ...vars } })
      const { plugin } = await runConfig(root, build())
      const warn = vi.fn()
      const hook = plugin.transformIndexHtml
      const handler = typeof hook === 'function' ? hook : hook?.handler
      const result = await handler!.call(
        { warn } as unknown as MinimalPluginContextWithoutEnvironment,
        html,
        { path: '/index.html', filename: 'index.html' },
      )
      return { html: result as string, warn }
    }

    const withConnectSrc = (sources: string) =>
      indexHtml.replace("connect-src 'self';", `connect-src ${sources};`)

    it('leaves the tag as the generator wrote it', async () => {
      const { html } = await builtPage({ VUESTRATA_API_URL: 'https://api.acme.test/v1' })

      expect(metaPolicy(html)).toBe(metaPolicy(indexHtml))
    })

    it('warns when that tag will block the API the build was given', async () => {
      // The committed tag says 'self'. Nothing else would mention it until a
      // browser blocked every call of the deployed app.
      const { warn } = await builtPage({ VUESTRATA_API_URL: 'https://api.acme.test/v1' })

      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(
          /VUESTRATA_API_URL is on https:\/\/api\.acme\.test, which the CSP <meta>/,
        ),
      )
      // Both ways out, by name.
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('--from-env'))
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('--runtime-config'))
    })

    it.each([
      ['a same-origin API', '/api', indexHtml],
      [
        'a tag rendered for that origin',
        'https://api.acme.test/v1',
        withConnectSrc("'self' https://api.acme.test"),
      ],
      [
        'a tag left to the header (--runtime-config)',
        'https://api.acme.test/v1',
        withConnectSrc('*'),
      ],
      [
        'a tag whose wildcard covers the origin',
        'https://api.acme.test/v1',
        withConnectSrc("'self' https://*.acme.test"),
      ],
      [
        'a page with no CSP tag',
        'https://api.acme.test/v1',
        '<html><head><meta charset="UTF-8" /></head><body></body></html>',
      ],
    ])('says nothing for %s', async (_, apiUrl, html) => {
      const { warn } = await builtPage({ VUESTRATA_API_URL: apiUrl }, html)

      expect(warn).not.toHaveBeenCalled()
    })

    it.each([
      ['a wildcard for another domain', "'self' https://*.other.test"],
      ['the same host on another port', "'self' https://api.acme.test:8443"],
      ['the same host over another scheme', "'self' wss://api.acme.test"],
    ])('still warns for %s', async (_, sources) => {
      const { warn } = await builtPage(
        { VUESTRATA_API_URL: 'https://api.acme.test/v1' },
        withConnectSrc(sources),
      )

      expect(warn).toHaveBeenCalledTimes(1)
    })
  })

  it('is not sent with the MSW worker script, whose own fetches it would block', async () => {
    // A service worker is governed by the policy its script was served with.
    // The demo's worker re-fetches what it has no handler for, web fonts
    // included, and connect-src names no font host.
    const root = project({ '.env': { VUESTRATA_RUNTIME_MODE: 'demo' } })
    const preview = await served(root, { preview: true, mode: 'development' })
    const dev = await served(root)

    for (const url of ['/mockServiceWorker.js', '/mockServiceWorker.js?v=2']) {
      expect(await previewHeader(preview, url), url).toBeUndefined()
      expect(await devHeader(dev, undefined, undefined, url), url).toBe('')
    }
    // Every other response still carries it, other scripts included.
    for (const url of ['/', '/assets/mockServiceWorker.js', '/runtime-config.js']) {
      expect(await previewHeader(preview, url), url).toContain("default-src 'self'")
      expect(await devHeader(dev, undefined, undefined, url), url).toContain("default-src 'self'")
    }
  })

  it('is not sent by a build, which serves nothing', async () => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })
    const plugin = vuestrataEnv()
    await resolveConfig(
      { configFile: false, root, logLevel: 'silent', plugins: [plugin] },
      'build',
      'production',
    )
    const { server, use } = devServer()

    await devMiddlewares(plugin, server)

    expect(await previewHeader(plugin)).toBeUndefined()
    // Only the answer for runtime-config.js.
    expect(use).toHaveBeenCalledTimes(1)
    expect(respond(use.mock.calls[0]![0]).headers.size).toBe(0)
  })

  it('is not sent to a test run, which has no page', async () => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })

    expect(await previewHeader(await served(root, { mode: 'test' }))).toBeUndefined()
  })
})

describe("the project's deploy.config.ts", () => {
  const deployConfig = {
    env: {
      VUESTRATA_FEATURE_BILLING: z.enum(['on', 'off']).default('off'),
      VUESTRATA_MAPS_KEY: z.string().min(8),
      VUESTRATA_SUPABASE_URL: z.url(),
    },
    runtime: ['VUESTRATA_SUPABASE_URL'],
  } as VuestrataEnvOptions['deployConfig']

  const valid = { ...production, VUESTRATA_API_URL: '/api', VUESTRATA_MAPS_KEY: 'pk_live_12345678' }

  it('passes a build whose declared variables are valid', async () => {
    const root = project({ '.env': { ...valid, VUESTRATA_FEATURE_BILLING: 'on' } })

    await expect(runConfig(root, build(), { deployConfig })).resolves.toBeDefined()
  })

  it('fails a build on an invalid declared variable, naming it', async () => {
    const root = project({ '.env': { ...valid, VUESTRATA_FEATURE_BILLING: 'maybe' } })

    await expect(runConfig(root, build(), { deployConfig })).rejects.toThrow(
      /Invalid app environment \(deploy\.config\.ts\)[\s\S]*VUESTRATA_FEATURE_BILLING/,
    )
  })

  it('fails a build that lacks a required variable', async () => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })

    await expect(runConfig(root, build(), { deployConfig })).rejects.toThrow(/VUESTRATA_MAPS_KEY/)
  })

  it('lets a runtime variable be absent from the build, but not invalid', async () => {
    // VUESTRATA_SUPABASE_URL is required, and arrives when the container starts.
    await expect(
      runConfig(project({ '.env': valid }), build(), { deployConfig }),
    ).resolves.toBeDefined()

    const root = project({ '.env': { ...valid, VUESTRATA_SUPABASE_URL: 'not a url' } })
    await expect(runConfig(root, build(), { deployConfig })).rejects.toThrow(
      /VUESTRATA_SUPABASE_URL/,
    )
  })

  it('applies to vp dev as well, so the mistake is seen before the build', async () => {
    const root = project({ '.env': { ...valid, VUESTRATA_FEATURE_BILLING: 'maybe' } })

    await expect(runConfig(root, serve(), { deployConfig })).rejects.toThrow(
      /VUESTRATA_FEATURE_BILLING/,
    )
  })

  it('does not hold a test run to the variables of a deployment', async () => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })

    await expect(runConfig(root, serve('test'), { deployConfig })).resolves.toBeDefined()
  })

  it.each([
    [
      'a variable that shadows a built-in one',
      { env: { VUESTRATA_API_URL: z.string().optional() } },
      /built-in variable/,
    ],
    [
      'a variable Vite would not expose',
      { env: { STRIPE_KEY: z.string().optional() } },
      /VUESTRATA_ followed by/,
    ],
    [
      'a runtime key that is not declared',
      { env: {}, runtime: ['VUESTRATA_OTHER'] },
      /not declared under env/,
    ],
    [
      'a header source with a path',
      { headers: { connectSrc: ['https://api.acme.test/v1'] } },
      /headers\.connectSrc\[0\]/,
    ],
    ['a header option it does not know', { headers: { scriptSrc: [] } }, /unknown option/],
    [
      'a COOP value that does not exist',
      { headers: { crossOriginOpenerPolicy: 'allow-popups' } },
      /crossOriginOpenerPolicy/,
    ],
  ])('fails a build on %s', async (_, config, message) => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })

    await expect(
      runConfig(root, build(), { deployConfig: config as VuestrataEnvOptions['deployConfig'] }),
    ).rejects.toThrow(message)
  })

  it('reads nothing, and fails nothing, for a project that has no such file', async () => {
    // A project that has not taken the release that introduced it yet.
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })

    await expect(runConfig(root, build())).resolves.toBeDefined()
  })
})

describe('the adapters a project registered in auth.config.ts', () => {
  const AUTH_CONFIG = 'src/modules/app/config/auth.config.ts'

  /** A project root whose `auth.config.ts` is `source`. */
  function projectWith(source: string, vars: Record<string, string> = {}) {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api', ...vars } })
    const file = path.join(root, AUTH_CONFIG)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, source)
    return root
  }

  const config = (body: string) =>
    `import { defineAuthConfig } from '~/lib/auth'\n\nexport default defineAuthConfig(${body})\n`

  // What a real one looks like: a lazy SDK adapter, a cookie-transport one,
  // and a factory written inline. None of these imports resolves from the temp
  // root, which is the point: the file is read, never run.
  const REGISTERED = config(`{
    endpoints: { ...endpointPresets.vuestrata, me: '/users/me' },
    adapters: {
      supabase: { transport: 'bearer', load: () => import('~/auth/supabase-adapter') },
      'company-sso': { transport: 'cookie' as const, create: createSsoAdapter },
      legacy: (options) => createLegacyAdapter(options),
    },
  }`)

  it('accepts a registered name and hands the registrations to the browser', async () => {
    const root = projectWith(REGISTERED, { VUESTRATA_AUTH_ADAPTER: 'supabase' })

    const { result } = await runConfig(root, build())

    expect(JSON.parse(String(result.define?.__VUESTRATA_AUTH_ADAPTERS__))).toEqual({
      supabase: 'bearer',
      'company-sso': 'cookie',
      legacy: 'bearer',
    })
  })

  it('fails the build for a name that is not registered, naming the file', async () => {
    const root = projectWith(REGISTERED, { VUESTRATA_AUTH_ADAPTER: 'firebase' })

    await expect(runConfig(root, build())).rejects.toThrow(
      /unknown auth adapter "firebase".*src\/modules\/app\/config\/auth\.config\.ts/s,
    )
  })

  it('applies the session-persistence rule by the transport the adapter declares', async () => {
    const cookie = projectWith(REGISTERED, { VUESTRATA_AUTH_ADAPTER: 'company-sso' })
    await expect(runConfig(cookie, build())).rejects.toThrow(
      /has no meaning with VUESTRATA_AUTH_ADAPTER="company-sso"/,
    )

    const explicit = projectWith(REGISTERED, {
      VUESTRATA_AUTH_ADAPTER: 'company-sso',
      VUESTRATA_SESSION_PERSISTENCE: 'none',
    })
    await expect(runConfig(explicit, build())).resolves.toBeDefined()
  })

  it('reads the shipped, empty file as no adapters', () => {
    expect(readAuthAdapters(process.cwd())).toEqual({})
    expect(scanAuthAdapters(config('{}'))).toEqual({})
  })

  it('reads a project with no auth.config.ts as no adapters', () => {
    expect(readAuthAdapters(project({}))).toEqual({})
  })

  it('never runs the file', () => {
    // An SDK that expects a browser, and a statement that would end the build.
    const source = `import { createClient } from 'an-sdk-that-is-not-installed'
import { defineAuthConfig } from '~/lib/auth'

const client = createClient(window.location.origin)
throw new Error('auth.config.ts was executed')

export default defineAuthConfig({
  adapters: { sdk: { transport: 'bearer', create: () => client.adapter() } },
})
`
    expect(scanAuthAdapters(source)).toEqual({ sdk: 'bearer' })
  })

  it('sees through the type-level wrappers a project may add', () => {
    expect(
      scanAuthAdapters(
        `export default defineAuthConfig(({ adapters: { one: ((options) => create(options)) as AuthAdapterFactory } }) satisfies AuthConfig)`,
      ),
    ).toEqual({ one: 'bearer' })
    expect(
      scanAuthAdapters(`export default { adapters: { two: { load } } } satisfies AuthConfig`),
    ).toEqual({ two: 'bearer' })
  })

  // Each of these would register an adapter the build cannot see, or one whose
  // transport it would have to guess. The build says so instead.
  it.each([
    ['a spread in adapters', '{ adapters: { ...others } }', /`adapters` uses a spread/],
    ['a spread in the configuration', '{ ...base }', /the configuration uses a spread/],
    ['a computed name', '{ adapters: { [NAME]: create } }', /computed name/],
    ['adapters held in a variable', '{ adapters }', /`adapters` is not an object literal/],
    [
      'a transport that is not a literal',
      '{ adapters: { sso: { transport: TRANSPORT, create } } }',
      /adapter "sso" does not declare its transport as a literal/,
    ],
    [
      'a transport that is not one',
      "{ adapters: { sso: { transport: 'header', create } } }",
      /adapter "sso" does not declare its transport as a literal/,
    ],
    ['a built-in name', '{ adapters: { jwt: () => adapter } }', /"jwt" is a built-in adapter/],
    [
      'a name that is not usable',
      '{ adapters: { My_SSO: () => adapter } }',
      /not a usable adapter name/,
    ],
    // `adapters` under another spelling. Read as "no adapters", the build would
    // reject the project's adapter name and tell it to register what it did.
    [
      'a computed key in the configuration',
      "{ ['adapters']: { sso: { create } } }",
      /the configuration has a computed key/,
    ],
    [
      'a template-literal key in the configuration',
      '{ [`adapters`]: { sso: { create } } }',
      /the configuration has a computed key/,
    ],
    [
      'a computed key that is not adapters at all',
      '{ [KEY]: 1, adapters: { sso: { create } } }',
      /the configuration has a computed key/,
    ],
    ['adapters as a getter', '{ get adapters() { return all } }', /`adapters` is not an object/],
    // An adapter whose transport cannot be read. Read as bearer, a cookie
    // adapter would pass the build under a bearer persistence mode.
    [
      'an adapter held in a variable',
      '{ adapters: { sso: ssoRegistration } }',
      /adapter "sso" is not written inline.*literal transport/s,
    ],
    [
      'an adapter built by a call',
      '{ adapters: { sso: cookieAdapter(create) } }',
      /adapter "sso" is not written inline/,
    ],
    [
      'an adapter read from a getter',
      '{ adapters: { get sso() { return registration } } }',
      /adapter "sso" is not written inline/,
    ],
    [
      'a computed key inside an adapter',
      "{ adapters: { sso: { ['transport']: 'cookie', create } } }",
      /adapter "sso" has a computed key/,
    ],
    [
      'a spread inside an adapter',
      '{ adapters: { sso: { ...shared, create } } }',
      /adapter "sso" uses a spread/,
    ],
    [
      'a template-literal transport',
      '{ adapters: { sso: { transport: `cookie`, create } } }',
      /adapter "sso" does not declare its transport as a literal/,
    ],
  ])('refuses %s', (_case, body, message) => {
    expect(() => scanAuthAdapters(config(body))).toThrow(message)
    // Every one of them explains how the file has to be written.
    expect(() => scanAuthAdapters(config(body))).toThrow(/without running it/)
  })

  // A default export that is a call can build its configuration from
  // anything. Only `defineAuthConfig(<one object>)` is known to hand back the
  // object it was given.
  it.each([
    [
      'a helper that merges configurations',
      'merge(base, { adapters: { sso: { create } } })',
      /a call to something other than defineAuthConfig\(\)/,
    ],
    [
      'Object.assign',
      'Object.assign({}, { adapters: { sso: { create } } })',
      /a call to something other than defineAuthConfig\(\)/,
    ],
    [
      'defineAuthConfig with the adapters in a second argument',
      'defineAuthConfig({}, { adapters: { sso: { create } } })',
      /not called with exactly one argument/,
    ],
    [
      'defineAuthConfig with a spread argument',
      'defineAuthConfig(...parts)',
      /exactly one argument/,
    ],
    ['defineAuthConfig with no argument', 'defineAuthConfig()', /exactly one argument/],
    [
      'defineAuthConfig given a variable',
      'defineAuthConfig(config)',
      /not an object literal passed to defineAuthConfig\(\)/,
    ],
  ])('refuses a default export that is %s', (_case, expression, message) => {
    const source = `export default ${expression}\n`
    expect(() => scanAuthAdapters(source)).toThrow(message)
    expect(() => scanAuthAdapters(source)).toThrow(/without running it/)
  })

  it('reads a plain key, a quoted key and a method as what they are', () => {
    expect(
      scanAuthAdapters(
        config(`{
          'adapters': {
            inline: () => adapter,
            'quoted-name': function (options) { return build(options) },
            method(options) { return build(options) },
            stated: { 'transport': 'cookie', create },
          },
        }`),
      ),
    ).toEqual({ inline: 'bearer', 'quoted-name': 'bearer', method: 'bearer', stated: 'cookie' })
  })

  it('refuses a file whose default export it cannot read', () => {
    expect(() => scanAuthAdapters('export default config\n')).toThrow(/not an object literal/)
    expect(() => scanAuthAdapters('export const config = {}\n')).toThrow(/no default export/)
    expect(() => scanAuthAdapters('export default {')).toThrow(/could not be parsed/)
  })

  it('fails the build, rather than ignoring adapters it cannot read', async () => {
    const root = projectWith(config('{ adapters: { ...others } }'))

    await expect(runConfig(root, build())).rejects.toThrow(/auth\.config\.ts.*spread/s)
  })

  it('fails the build for a cookie adapter it would have read as a bearer one', async () => {
    // The registration is in a variable, and says `transport: 'cookie'`. Under
    // the default persistence mode, which is a bearer one, this used to build.
    const source = `import { defineAuthConfig } from '~/lib/auth'

const sso = { transport: 'cookie', create: createSsoAdapter } as const

export default defineAuthConfig({ adapters: { sso } })
`
    const root = projectWith(source, { VUESTRATA_AUTH_ADAPTER: 'sso' })

    await expect(runConfig(root, build())).rejects.toThrow(/adapter "sso" is not written inline/)
  })
})

describe('the adapter names a project declares to the type checker', () => {
  const AUTH_CONFIG = 'src/modules/app/config/auth.config.ts'

  function projectWith(source: string) {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })
    const file = path.join(root, AUTH_CONFIG)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, source)
    return root
  }

  /** An `auth.config.ts` that declares `declared` and registers `registered`. */
  const source = (
    declared: string[],
    registered: string[],
  ) => `import { defineAuthConfig } from '~/lib/auth'

declare module '~/lib/auth' {
  interface RegisteredAuthAdapterNames {
${declared.map((name) => `    '${name}': true`).join('\n')}
  }
}

export default defineAuthConfig({
  adapters: {
${registered.map((name) => `    '${name}': { transport: 'bearer', create },`).join('\n')}
  },
})
`

  it('reads the declared names beside the registered ones', () => {
    expect(scanAuthConfig(source(['acme', 'company-sso'], ['acme']))).toEqual({
      adapters: { acme: 'bearer' },
      declared: ['acme', 'company-sso'],
    })
    // Written without quotes, and exported: both merge the same way.
    expect(
      scanAuthConfig(`declare module '~/lib/auth' {
  export interface RegisteredAuthAdapterNames { acme: true }
}
export default defineAuthConfig({})
`).declared,
    ).toEqual(['acme'])
  })

  it('says nothing when every registered adapter is declared', async () => {
    const { warn } = await runConfig(projectWith(source(['acme'], ['acme'])), build())

    expect(warn).not.toHaveBeenCalled()
  })

  it('says nothing about the shipped file, which registers and declares none', async () => {
    const shipped = fs.readFileSync(path.join(process.cwd(), AUTH_CONFIG), 'utf8')

    expect(scanAuthConfig(shipped)).toEqual({ adapters: {}, declared: [] })
    const { warn } = await runConfig(projectWith(shipped), build())
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns about an adapter that is registered and not declared, with the lines to add', async () => {
    const { warn, result } = await runConfig(
      projectWith(source([], ['acme', 'company-sso'])),
      build(),
    )

    // A warning: the adapter works, and the build still accepts its name.
    expect(JSON.parse(String(result.define?.__VUESTRATA_AUTH_ADAPTERS__))).toEqual({
      acme: 'bearer',
      'company-sso': 'bearer',
    })
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0]?.[0]).toMatch(
      /auth\.config\.ts registers the adapter "acme" without declaring its name/,
    )
    expect(warn.mock.calls[0]?.[0]).toContain(
      "declare module '~/lib/auth' {\n    interface RegisteredAuthAdapterNames {\n      acme: true",
    )
    // A name that is not an identifier is quoted in the lines to paste.
    expect(warn.mock.calls[1]?.[0]).toContain("'company-sso': true")
  })

  it('warns about a name that is declared and not registered', async () => {
    const { warn } = await runConfig(projectWith(source(['acme', 'gone'], ['acme'])), build())

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(
        /declares "gone" in RegisteredAuthAdapterNames, but registers no adapter/,
      ),
    )
  })

  it('has nothing to say when the two lists agree', () => {
    expect(describeUndeclaredAdapters({}, [])).toEqual([])
    expect(describeUndeclaredAdapters({ acme: 'cookie' }, ['acme'])).toEqual([])
  })
})

// A project that edited scripts/security/headers.mjs keeps its 1.0 copy, and
// this plugin, new in 1.1.0, is installed beside it. A named import of what
// 1.1.0 added would fail when the module is linked, taking `vite.config.ts` and
// every `vp` command with it. The plugin reads the generators through a
// namespace and asks for the new members instead.
describe('beside the header generators a project kept from 1.0', () => {
  /** What scripts/security/headers.mjs exported at 1.0.1-alpha.6, and nothing more. */
  const generators10 = {
    connectSrcFor: (apiUrl: string) => (apiUrl.startsWith('/') ? null : new URL(apiUrl).origin),
    buildCsp: () => "default-src 'self'",
    buildSecurityHeaders: () => [],
    CACHE_RULES: [],
    GENERATED_BANNER: '# GENERATED',
  }
  const kept = { headerGenerators: generators10 }
  const KEPT_WARNING = 'scripts/security/headers.mjs is a copy from before 1.1.0'

  const env = { '.env': { ...production, VUESTRATA_API_URL: 'https://api.acme.test/v1' } }

  it('still builds, and says once what the kept copy costs', async () => {
    const { result, warn } = await runConfig(project(env), build(), kept)

    expect(result.define).toMatchObject({ __VUESTRATA_DEMO__: 'false' })
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain(KEPT_WARNING)
    expect(warn.mock.calls[0]![0]).toContain('.vuestrata/incoming/scripts/security/headers.mjs')
  })

  it('still serves, sending no policy, as 1.0 did', async () => {
    const { plugin } = await runConfig(project(env), serve('production'), kept)

    const use = vi.fn<(handler: Connect.NextHandleFunction) => void>()
    const hook = plugin.configureServer
    const handler = typeof hook === 'function' ? hook : hook?.handler
    await handler!.call(
      {} as MinimalPluginContextWithoutEnvironment,
      {
        middlewares: { use },
        resolvedUrls: { local: ['http://localhost:3449/'], network: [] },
      } as unknown as ViteDevServer,
    )

    // Only the runtime-config.js answer: no middleware that sets the header.
    expect(use).toHaveBeenCalledOnce()
    const headers = new Map<string, string>()
    use.mock.calls[0]![0](
      { url: '/' } as Connect.IncomingMessage,
      { setHeader: (name: string, value: string) => headers.set(name, value) } as never,
      vi.fn(),
    )
    expect(headers.has('Content-Security-Policy')).toBe(false)
  })

  it('leaves the page as written, and still loads the runtime configuration', async () => {
    const { plugin } = await runConfig(project(env), serve('production'), kept)
    const html = '<head>\n  <meta charset="UTF-8" />\n</head>'

    const result = await transformHtml(plugin, html, { server: {} as ViteDevServer })

    expect(result).toContain('<script src="/runtime-config.js"></script>')
  })

  it('does not hold a test run to anything either', async () => {
    const { warn } = await runConfig(project(env), serve('test'), kept)

    expect(warn).not.toHaveBeenCalled()
  })

  it('is not what a project with this release’s generators gets', async () => {
    const { warn } = await runConfig(project(env), build())

    expect(warn.mock.calls.flat().join('\n')).not.toContain(KEPT_WARNING)
  })
})
