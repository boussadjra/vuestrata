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

import {
  describeUndeclaredAdapters,
  readAuthAdapters,
  scanAuthAdapters,
  scanAuthConfig,
  vuestrataEnv,
} from '../../../scripts/vite/vuestrata-plugin.mjs'

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

      expect(result.define).toEqual({
        __VUESTRATA_DEMO__: demo,
        // No auth.config.ts in this root, so no adapter of the project's own.
        __VUESTRATA_AUTH_ADAPTERS__: '{}',
      })
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
