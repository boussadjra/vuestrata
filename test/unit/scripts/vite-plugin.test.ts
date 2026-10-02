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
  type ViteDevServer,
} from 'vite-plus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { z } from 'zod'

import { vuestrataEnv, type VuestrataEnvOptions } from '../../../scripts/vite/vuestrata-plugin.mjs'

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
    if (key.startsWith('VUESTRATA_') || key === 'DEV_API_TARGET') vi.stubEnv(key, undefined)
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

      expect(result.define).toEqual({ __VUESTRATA_DEMO__: demo })
      expect(result.build).toEqual({ sourcemap })
    },
  )

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

  async function tags(plugin: Plugin, ctx: Partial<IndexHtmlTransformContext> = {}) {
    return (await transformHtml(plugin, indexHtml, ctx)) as HtmlTagDescriptor[]
  }

  it('is loaded by every page, as a separate classic script', async () => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })

    const [tag, ...rest] = await tags(await resolved(root))

    expect(rest).toEqual([])
    // No `type="module"` and no `defer`/`async`: a classic script runs before
    // any module script, and the app reads the values while its modules are
    // evaluated. No children: an inline copy could not differ per deployment,
    // and `script-src 'self'` would refuse it.
    expect(tag).toEqual({
      tag: 'script',
      attrs: { src: '/runtime-config.js' },
      injectTo: 'head-prepend',
    })
  })

  it('is the same under vp dev, so development behaves like the build', async () => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })
    const plugin = await resolved(root)

    expect(await tags(plugin, { server: {} as ViteDevServer })).toEqual(await tags(plugin))
  })

  it.each([
    ['/', '/runtime-config.js'],
    ['/console/', '/console/runtime-config.js'],
    ['https://cdn.acme.test/app/', 'https://cdn.acme.test/app/runtime-config.js'],
  ])("follows Vite's base %s", async (base, src) => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: '/api' } })

    const [tag] = await tags(await resolved(root, { base }))

    expect(tag?.attrs).toEqual({ src })
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
      // Ahead of the app's module script in the document.
      expect(html.indexOf('/runtime-config.js')).toBeLessThan(html.indexOf('type="module"'))
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

  it('needs no help from the plugin to reach a cross-origin API in development', async () => {
    // The plugin used to widen the page's CSP <meta> for the dev server. The
    // tag no longer restricts connections, so the page is served as written.
    const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(indexHtml)?.[1]

    expect(policy).toContain('connect-src *;')
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
