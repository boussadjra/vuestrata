import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  build as viteBuild,
  resolveConfig,
  type ConfigEnv,
  type ConfigPluginContext,
  type Connect,
  type Plugin,
  type PreviewServer,
  type ViteDevServer,
} from 'vite-plus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { resolveBase, vuestrataEnv } from '../../../scripts/vite/vuestrata-plugin.mjs'

/**
 * `VUESTRATA_BASE_PATH` is turned into Vite's `base` by the plugin, so that a
 * project's own `vite.config.ts` needs no change to be served under a path
 * prefix: one variable, read by the build, the dev server, the preview server
 * and the header generator.
 *
 * What a project that sets nothing gets is pinned in base-path-default.test.ts.
 */

const production = {
  VUESTRATA_RUNTIME_MODE: 'production',
  VUESTRATA_USE_MOCKS: 'false',
  VUESTRATA_AUTH_ADAPTER: 'jwt',
  VUESTRATA_API_URL: '/api',
}

const roots: string[] = []

function project(vars: Record<string, string> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vuestrata-base-'))
  roots.push(root)
  const lines = Object.entries({ ...production, ...vars }).map(([key, value]) => `${key}=${value}`)
  fs.writeFileSync(path.join(root, '.env'), `${lines.join('\n')}\n`)
  return root
}

const BUILD: ConfigEnv = { command: 'build', mode: 'production' }
const DEV: ConfigEnv = { command: 'serve', mode: 'development' }
const PREVIEW: ConfigEnv = { command: 'serve', mode: 'production', isPreview: true }

/** Runs the plugin's `config` hook the way Vite does, capturing warnings. */
async function runConfig(root: string, env: ConfigEnv, config: { base?: string } = {}) {
  const plugin = vuestrataEnv({ deployConfig: {} })
  const warn = vi.fn()
  const hook = plugin.config
  const handler = typeof hook === 'function' ? hook : hook?.handler
  const result = await handler!.call(
    { warn } as unknown as ConfigPluginContext,
    { root, ...config },
    env,
  )
  return { result: (result ?? {}) as { base?: string }, warn }
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

describe('the base the plugin gives Vite', () => {
  it.each([
    ['vp build', BUILD],
    ['vp dev', DEV],
    ['vp preview', PREVIEW],
  ])('%s: is VUESTRATA_BASE_PATH', async (_name, env) => {
    const { result, warn } = await runConfig(project({ VUESTRATA_BASE_PATH: '/console/' }), env)

    expect(result.base).toBe('/console/')
    expect(warn).not.toHaveBeenCalled()
  })

  it('is read from the shell as well as from .env files', async () => {
    vi.stubEnv('VUESTRATA_BASE_PATH', '/portal/')

    expect((await runConfig(project(), BUILD)).result.base).toBe('/portal/')
  })

  it('is left alone when the variable says the root', async () => {
    const { result } = await runConfig(project({ VUESTRATA_BASE_PATH: '/' }), BUILD)

    expect(Object.keys(result)).not.toContain('base')
  })

  it('is what Vite resolves, for a config that says nothing about `base`', async () => {
    const root = project({ VUESTRATA_BASE_PATH: '/console/' })

    for (const [command, isPreview] of [
      ['build', false],
      ['serve', false],
      ['serve', true],
    ] as const) {
      const config = await resolveConfig(
        {
          configFile: false,
          root,
          logLevel: 'silent',
          plugins: [vuestrataEnv({ deployConfig: {} })],
        },
        command,
        'production',
        'production',
        isPreview,
      )
      expect(config.base, `${command}${isPreview ? ' (preview)' : ''}`).toBe('/console/')
    }
  })

  it.each([
    ['without its slashes', 'console'],
    ['without the trailing slash', '/console'],
    ['naming another origin', '//cdn.example.com/console/'],
    ['with a parent segment', '/a/../b/'],
    ['as a full URL', 'https://cdn.example.com/'],
  ])('fails the build for a value %s, naming the variable', async (_name, value) => {
    await expect(runConfig(project({ VUESTRATA_BASE_PATH: value }), BUILD)).rejects.toThrow(
      /VUESTRATA_BASE_PATH/,
    )
    // The dev server is held to it too: nothing would load under a bad base.
    await expect(runConfig(project({ VUESTRATA_BASE_PATH: value }), DEV)).rejects.toThrow(
      /VUESTRATA_BASE_PATH/,
    )
  })
})

describe('a project that sets `base` in its own Vite config', () => {
  it('wins when the variable is not set, and is told what does not hear it', async () => {
    const { result, warn } = await runConfig(project(), BUILD, { base: '/console/' })

    // Nothing returned: Vite keeps the project's value.
    expect(Object.keys(result)).not.toContain('base')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toMatch(
      /base "\/console\/" is set in the Vite config rather than in VUESTRATA_BASE_PATH/,
    )
    expect(warn.mock.calls[0]![0]).toMatch(/Set VUESTRATA_BASE_PATH=\/console\/ and remove `base`/)
  })

  it('is told when its base is not a path the app can be served under', async () => {
    for (const base of ['https://cdn.example.com/app/', './']) {
      const { result, warn } = await runConfig(project(), BUILD, { base })

      expect(Object.keys(result)).not.toContain('base')
      expect(warn.mock.calls[0]![0]).toMatch(/another origin is not supported/)
    }
  })

  it('says nothing when both name the same base', async () => {
    const root = project({ VUESTRATA_BASE_PATH: '/console/' })

    for (const base of ['/console/', '/console']) {
      const { result, warn } = await runConfig(root, BUILD, { base })

      expect(Object.keys(result)).not.toContain('base')
      expect(warn).not.toHaveBeenCalled()
    }
  })

  it('fails the build when the two disagree', async () => {
    const root = project({ VUESTRATA_BASE_PATH: '/console/' })

    await expect(runConfig(root, BUILD, { base: '/portal/' })).rejects.toThrow(
      /VUESTRATA_BASE_PATH="\/console\/" and base "\/portal\/".*disagree/,
    )
    // The root, said out loud, is a disagreement too.
    await expect(
      runConfig(project({ VUESTRATA_BASE_PATH: '/' }), BUILD, { base: '/portal/' }),
    ).rejects.toThrow(/disagree/)
  })

  it('says nothing about a config that spells out the default', async () => {
    const { result, warn } = await runConfig(project(), BUILD, { base: '/' })

    expect(Object.keys(result)).not.toContain('base')
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('resolveBase', () => {
  const warn = vi.fn()

  it('is the variable when the config has no base', () => {
    expect(resolveBase({ fromEnv: '/console/', envIsSet: true, fromConfig: undefined, warn })).toBe(
      '/console/',
    )
    expect(
      resolveBase({ fromEnv: '/', envIsSet: false, fromConfig: undefined, warn }),
    ).toBeUndefined()
    expect(resolveBase({ fromEnv: '/', envIsSet: false, fromConfig: '', warn })).toBeUndefined()
  })
})

describe('a build under a base path', () => {
  /** The smallest project Vite can build: a page, its module, an icon. */
  function buildable(vars: Record<string, string>): string {
    const root = project(vars)
    fs.writeFileSync(
      path.join(root, 'index.html'),
      '<!doctype html><html><head><meta charset="UTF-8" /><title>t</title>' +
        '<link rel="icon" href="/favicon.svg" type="image/svg+xml" /></head>' +
        '<body><div id="app"></div><script type="module" src="/main.js"></script></body></html>',
    )
    fs.writeFileSync(
      path.join(root, 'main.js'),
      'document.title = import.meta.env.BASE_URL + String(Date.now())\n',
    )
    fs.mkdirSync(path.join(root, 'public'))
    fs.writeFileSync(
      path.join(root, 'public/favicon.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    )
    return root
  }

  const buildIn = (root: string) =>
    viteBuild({
      configFile: false,
      root,
      logLevel: 'silent',
      envPrefix: 'VUESTRATA_',
      plugins: [vuestrataEnv({ deployConfig: {} })],
    })

  const read = (root: string, file: string) => fs.readFileSync(path.join(root, file), 'utf8')

  it('puts the prefix in every URL of the page, and the files where they were', async () => {
    const root = buildable({ VUESTRATA_BASE_PATH: '/console/' })

    await buildIn(root)
    const html = read(root, 'dist/index.html')

    expect(html).toContain('<script src="/console/runtime-config.js"></script>')
    expect(html).toContain('href="/console/favicon.svg"')
    expect(html).toMatch(/<script type="module"[^>]* src="\/console\/assets\/[^"]+\.js"/)
    // No URL of the page is left at the root of the origin.
    expect(html.match(/(?:src|href)="\/(?!console\/)[^"]*"/g) ?? []).toEqual([])

    // The base is in the URLs, not in the layout of dist/: the server decides
    // where the directory is mounted (the image copies it into html/console/).
    expect(fs.existsSync(path.join(root, 'dist/runtime-config.js'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'dist/favicon.svg'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'dist/assets'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'dist/console'))).toBe(false)

    // And the bundle knows it, which is where the router and appUrl() read it.
    const [entry] = fs.readdirSync(path.join(root, 'dist/assets'))
    expect(read(root, `dist/assets/${entry}`)).toContain('/console/')
  }, 60_000)

  it('leaves every URL at the root when the variable is not set', async () => {
    const root = buildable({})

    await buildIn(root)
    const html = read(root, 'dist/index.html')

    expect(html).toContain('<script src="/runtime-config.js"></script>')
    expect(html).toContain('href="/favicon.svg"')
    expect(html).not.toContain('/console/')
  }, 60_000)
})

describe('the servers, under a base path', () => {
  const noop = () => undefined

  /** The plugin after Vite resolved a config for `root`. */
  async function served(root: string, preview: boolean): Promise<Plugin> {
    const plugin = vuestrataEnv({ deployConfig: {} }) as Plugin
    await resolveConfig(
      { configFile: false, root, logLevel: 'silent', plugins: [plugin] },
      'serve',
      'production',
      'production',
      preview,
    )
    return plugin
  }

  /** What the middlewares a hook registered do with a request for `url`. */
  async function respond(
    plugin: Plugin,
    hookName: 'configureServer' | 'configurePreviewServer',
    url: string,
  ) {
    const handlers: Connect.NextHandleFunction[] = []
    const server = {
      middlewares: { use: (handler: Connect.NextHandleFunction) => handlers.push(handler) },
      resolvedUrls: { local: ['http://127.0.0.1:3450/console/'], network: [] },
    }
    const hook = plugin[hookName]
    const handler = typeof hook === 'function' ? hook : hook?.handler
    await (handler as unknown as (server: unknown) => unknown).call(
      {},
      server as unknown as ViteDevServer & PreviewServer,
    )

    const headers: Record<string, string> = {}
    let body: string | undefined
    const response = {
      setHeader: (name: string, value: string) => {
        headers[name.toLowerCase()] = value
      },
      end: (text: string) => {
        body = text
      },
    }
    for (const middleware of handlers) {
      if (body !== undefined) break
      middleware(
        { url } as Connect.IncomingMessage,
        response as unknown as Parameters<Connect.NextHandleFunction>[1],
        noop,
      )
    }
    return { headers, body }
  }

  it('vp dev answers runtime-config.js under the base, for a project with no copy', async () => {
    const plugin = await served(project({ VUESTRATA_BASE_PATH: '/console/' }), false)

    const under = await respond(plugin, 'configureServer', '/console/runtime-config.js')
    expect(under.body).toBe('window.__VUESTRATA_RUNTIME__ ||= {}\n')
    expect(under.headers['cache-control']).toBe('no-store')

    // At the root of the origin there is no such file: that is not the app.
    const atRoot = await respond(plugin, 'configureServer', '/runtime-config.js')
    expect(atRoot.body).toBeUndefined()
  })

  it.each([['configureServer'], ['configurePreviewServer']] as const)(
    '%s: the mock worker under the base is the one response without the policy',
    async (hook) => {
      const plugin = await served(
        project({ VUESTRATA_BASE_PATH: '/console/' }),
        hook !== 'configureServer',
      )

      const worker = await respond(plugin, hook, '/console/mockServiceWorker.js')
      expect(worker.headers['content-security-policy']).toBeUndefined()

      for (const url of ['/console/', '/console/assets/x.js', '/mockServiceWorker.js']) {
        const other = await respond(plugin, hook, url)
        expect(other.headers['content-security-policy'], url).toContain("default-src 'self'")
      }
    },
  )
})
