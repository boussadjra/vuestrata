import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  resolveConfig,
  type ConfigEnv,
  type ConfigPluginContext,
  type IndexHtmlTransformContext,
  type MinimalPluginContextWithoutEnvironment,
  type Plugin,
  type ViteDevServer,
} from 'vite-plus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { vuestrataEnv } from '../../../scripts/vite/vuestrata-plugin.mjs'

/**
 * The Vite plugin is where the env schema meets the build: it decides what
 * `__VUESTRATA_DEMO__` compiles to, and — under `vp dev` — whether requests for
 * the API path are proxied to `DEV_API_TARGET`.
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
async function runConfig(root: string, env: ConfigEnv) {
  const plugin = vuestrataEnv()
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

describe('the dev page CSP', () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')
  const server = {} as ViteDevServer

  function connectSrc(html: string): string[] {
    const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)?.[1] ?? ''
    const directive = policy.split(';').find((entry) => entry.trim().startsWith('connect-src'))
    return directive?.trim().split(/\s+/).slice(1) ?? []
  }

  it('lets the dev page reach a cross-origin API', async () => {
    const root = project({
      '.env.development.local': { ...production, VUESTRATA_API_URL: 'http://localhost:8000/api' },
    })
    const { plugin } = await runConfig(root, serve())

    const html = await transformHtml(plugin, indexHtml, { server })

    expect(typeof html).toBe('string')
    expect(connectSrc(html as string)).toEqual([...connectSrc(indexHtml), 'http://localhost:8000'])
  })

  it('leaves the page alone for a same-origin API', async () => {
    const root = project({ '.env.development.local': { ...production, VUESTRATA_API_URL: '/api' } })
    const { plugin } = await runConfig(root, serve())

    expect(await transformHtml(plugin, indexHtml, { server })).toBe(indexHtml)
  })

  it('never touches a built page', async () => {
    const root = project({ '.env': { ...production, VUESTRATA_API_URL: 'https://api.acme.test' } })
    const { plugin } = await runConfig(root, build())

    expect(await transformHtml(plugin, indexHtml, {})).toBe(indexHtml)
  })

  it('derives connect-src from default-src when the policy has none', async () => {
    const root = project({
      '.env.development.local': { ...production, VUESTRATA_API_URL: 'http://localhost:8000/api' },
    })
    const { plugin } = await runConfig(root, serve())
    const page = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self'" />`

    const html = await transformHtml(plugin, page, { server })

    expect(connectSrc(html as string)).toEqual(["'self'", 'http://localhost:8000'])
  })
})
