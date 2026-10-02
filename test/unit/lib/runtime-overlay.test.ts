import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import { ENV_KEYS, resolveRuntimeEnv } from '~/lib/config/env.schema'
import {
  readRuntimeOverlay,
  RUNTIME_CONFIG_GLOBAL,
  RUNTIME_OVERRIDABLE_KEYS,
} from '~/lib/config/runtime-overlay'

/**
 * The runtime overlay is what lets one built artifact serve every environment:
 * `runtime-config.js` assigns `window.__VUESTRATA_RUNTIME__` before the bundle
 * runs, and the allow-listed keys in it win over the values inlined at build
 * time.
 *
 * Whatever a deployment writes there reaches the browser, so the reader has to
 * be unbreakable: nothing in the object may throw, white-screen the page, or
 * switch on code the build compiled out.
 */

const scope = (overlay: unknown) => ({ [RUNTIME_CONFIG_GLOBAL]: overlay })

/** What the build inlined, for a production deployment. */
const built = {
  [ENV_KEYS.runtimeMode]: 'production',
  [ENV_KEYS.useMocks]: 'false',
  [ENV_KEYS.authAdapter]: 'jwt',
  [ENV_KEYS.apiUrl]: 'https://api.build.test',
  [ENV_KEYS.title]: 'Built',
}

describe('readRuntimeOverlay', () => {
  it('returns the allow-listed keys a deployment set', () => {
    const overlay = readRuntimeOverlay(
      scope({
        [ENV_KEYS.apiUrl]: 'https://api.staging.test',
        [ENV_KEYS.title]: 'Staging',
        [ENV_KEYS.errorReportingDsn]: 'https://key@errors.test/1',
        [ENV_KEYS.release]: 'abc123',
        [ENV_KEYS.sessionPersistence]: 'session',
      }),
    )

    expect(overlay).toEqual({
      [ENV_KEYS.apiUrl]: 'https://api.staging.test',
      [ENV_KEYS.title]: 'Staging',
      [ENV_KEYS.errorReportingDsn]: 'https://key@errors.test/1',
      [ENV_KEYS.release]: 'abc123',
      [ENV_KEYS.sessionPersistence]: 'session',
    })
    expect(Object.keys(overlay).sort()).toEqual([...RUNTIME_OVERRIDABLE_KEYS].sort())
  })

  it.each([
    ['no global at all', {}],
    ['an undefined global', scope(undefined)],
    ['a null global', scope(null)],
    ['an empty object, as the shipped file assigns', scope({})],
    ['a scope that is not an object', undefined],
  ])('is empty and silent for %s', (_, source) => {
    const onWarn = vi.fn()

    expect(readRuntimeOverlay(source, { onWarn })).toEqual({})
    expect(onWarn).not.toHaveBeenCalled()
  })

  it.each([
    ['a string', 'VUESTRATA_API_URL=/api'],
    ['an array', [['VUESTRATA_API_URL', '/api']]],
    ['a number', 42],
  ])('ignores a global that is %s, with a warning', (_, source) => {
    const onWarn = vi.fn()

    expect(readRuntimeOverlay(scope(source), { onWarn })).toEqual({})
    expect(onWarn).toHaveBeenCalledTimes(1)
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining(RUNTIME_CONFIG_GLOBAL))
  })

  describe('a value that was never substituted', () => {
    it.each([
      ['an empty string', ''],
      ['whitespace', '   '],
      // A static host that serves the file as a template and sets no value.
      ['a placeholder', '${VUESTRATA_API_URL}'],
      ['a placeholder inside a URL', 'https://${API_HOST}/v1'],
      ['an empty placeholder', '${}'],
    ])('treats %s as absent, without a warning', (_, value) => {
      const onWarn = vi.fn()

      const overlay = readRuntimeOverlay(scope({ [ENV_KEYS.apiUrl]: value }), { onWarn })

      expect(overlay).toEqual({})
      expect(onWarn).not.toHaveBeenCalled()
    })

    it('keeps a value that merely contains a dollar sign', () => {
      expect(readRuntimeOverlay(scope({ [ENV_KEYS.title]: 'Cost $5' }))).toEqual({
        [ENV_KEYS.title]: 'Cost $5',
      })
    })

    it('trims what it keeps', () => {
      expect(readRuntimeOverlay(scope({ [ENV_KEYS.apiUrl]: '  /backend \n' }))).toEqual({
        [ENV_KEYS.apiUrl]: '/backend',
      })
    })
  })

  it.each([
    ['a number', 8080, 'number'],
    ['a boolean', true, 'boolean'],
    ['null', null, 'null'],
    ['an object', { url: '/api' }, 'object'],
    ['a function', () => '/api', 'function'],
  ])('ignores a value that is %s, with a warning naming the key', (_, value, type) => {
    const onWarn = vi.fn()

    const overlay = readRuntimeOverlay(
      scope({ [ENV_KEYS.apiUrl]: value, [ENV_KEYS.title]: 'Kept' }),
      { onWarn },
    )

    expect(overlay).toEqual({ [ENV_KEYS.title]: 'Kept' })
    expect(onWarn).toHaveBeenCalledTimes(1)
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining(ENV_KEYS.apiUrl))
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining(`received ${type}`))
  })

  it('ignores a key it does not know, with a warning', () => {
    const onWarn = vi.fn()

    const overlay = readRuntimeOverlay(
      scope({ VUESTRATA_FEATURE_X: 'on', API_URL: '/x', [ENV_KEYS.title]: 'Kept' }),
      { onWarn },
    )

    expect(overlay).toEqual({ [ENV_KEYS.title]: 'Kept' })
    expect(onWarn).toHaveBeenCalledTimes(2)
    expect(onWarn).toHaveBeenCalledWith(expect.stringMatching(/VUESTRATA_FEATURE_X.*not a runtime/))
    expect(onWarn).toHaveBeenCalledWith(expect.stringMatching(/API_URL.*not a runtime/))
  })

  it('accepts the keys a project declared runtime-overridable', () => {
    const onWarn = vi.fn()

    const overlay = readRuntimeOverlay(scope({ VUESTRATA_FEATURE_X: 'on' }), {
      extraKeys: ['VUESTRATA_FEATURE_X'],
      onWarn,
    })

    expect(overlay).toEqual({ VUESTRATA_FEATURE_X: 'on' })
    expect(onWarn).not.toHaveBeenCalled()
  })

  it('reads silently when no warning sink is given', () => {
    expect(() =>
      readRuntimeOverlay(
        scope({ [ENV_KEYS.runtimeMode]: 'demo', unknown: 1, [ENV_KEYS.title]: 2 }),
      ),
    ).not.toThrow()
  })

  it('never takes a key through the prototype chain', () => {
    const inherited = Object.create({ [ENV_KEYS.apiUrl]: 'https://inherited.test' }) as object

    expect(readRuntimeOverlay(scope(inherited))).toEqual({})
  })
})

describe('compile-time keys', () => {
  // What decides the CONTENTS of the bundle. A production build has no MSW and
  // no mock adapter in it; a deploy-time value cannot bring them back, and must
  // not be able to make the app believe they are there.
  const COMPILE_TIME = [
    [ENV_KEYS.runtimeMode, 'demo'],
    [ENV_KEYS.useMocks, 'true'],
    [ENV_KEYS.authAdapter, 'mock'],
    [ENV_KEYS.iconProvider, 'lucide'],
    [ENV_KEYS.theme, 'analog'],
    [ENV_KEYS.demoRetentionHours, '1'],
  ] as const

  it.each(COMPILE_TIME)('%s cannot be overridden at runtime', (key, value) => {
    const onWarn = vi.fn()

    expect(readRuntimeOverlay(scope({ [key]: value }), { onWarn })).toEqual({})
    expect(onWarn).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`${key}.*fixed when`)))
  })

  it('cannot be smuggled in as a project-declared key either', () => {
    // `extraKeys` comes from deploy.config.ts. The build refuses a built-in
    // name there, but the reader must not depend on the build having run.
    const overlay = readRuntimeOverlay(scope(Object.fromEntries(COMPILE_TIME)), {
      extraKeys: COMPILE_TIME.map(([key]) => key),
    })

    expect(overlay).toEqual({})
  })

  it('leaves the resolved environment exactly as it was built', () => {
    const overlay = readRuntimeOverlay(scope(Object.fromEntries(COMPILE_TIME)))
    const resolved = resolveRuntimeEnv({ ...built, ...overlay })

    expect(resolved).toEqual(resolveRuntimeEnv(built))
    expect(resolved.runtimeMode).toBe('production')
    expect(resolved.useMocks).toBe(false)
    expect(resolved.authAdapter).toBe('jwt')
  })

  it('is exactly the built-in keys outside the allow-list', () => {
    const overridable = new Set<string>(RUNTIME_OVERRIDABLE_KEYS)
    const fixed = Object.values(ENV_KEYS).filter((key) => !overridable.has(key))

    expect(fixed.sort()).toEqual(COMPILE_TIME.map(([key]) => key).sort())
  })
})

describe('precedence', () => {
  it('puts a runtime value over the one the build inlined', () => {
    const overlay = readRuntimeOverlay(
      scope({ [ENV_KEYS.apiUrl]: 'https://api.runtime.test', [ENV_KEYS.title]: 'Runtime' }),
    )

    const resolved = resolveRuntimeEnv({ ...built, ...overlay })

    expect(resolved.apiUrl).toBe('https://api.runtime.test')
    expect(resolved.title).toBe('Runtime')
  })

  it('keeps the built value for a key the deployment left unset', () => {
    const overlay = readRuntimeOverlay(scope({ [ENV_KEYS.title]: '${VUESTRATA_APP_TITLE}' }))

    const resolved = resolveRuntimeEnv({ ...built, ...overlay })

    expect(resolved.apiUrl).toBe('https://api.build.test')
    expect(resolved.title).toBe('Built')
  })

  it('holds a runtime value to the same rules, with a warning and a fallback', () => {
    const onWarn = vi.fn()
    const overlay = readRuntimeOverlay(
      scope({
        [ENV_KEYS.sessionPersistence]: 'forever',
        [ENV_KEYS.errorReportingDsn]: 'not a url',
        [ENV_KEYS.apiUrl]: 'ftp://files.test',
      }),
    )

    const resolved = resolveRuntimeEnv({ ...built, ...overlay }, { onWarn })

    // Never a throw, never a blank page: each bad value costs a warning.
    expect(resolved.sessionPersistence).toBe('refresh-cookie')
    expect(resolved.errorReporting.dsn).toBeUndefined()
    expect(resolved.apiUrl).toBe('/api')
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining(ENV_KEYS.sessionPersistence))
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining(ENV_KEYS.errorReportingDsn))
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining(ENV_KEYS.apiUrl))
  })
})

describe('the app, started with a runtime overlay', () => {
  // `runtimeEnv` and the API client's base URL are resolved while their modules
  // are evaluated. That is why the overlay is a script that runs first — and
  // this is the proof that nothing downstream needs to know about it.
  const RUNTIME_API = 'https://api.runtime.test/v2'
  const server = setupServer()

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => {
    server.resetHandlers()
    Reflect.deleteProperty(globalThis, RUNTIME_CONFIG_GLOBAL)
    vi.resetModules()
  })
  afterAll(() => server.close())

  it('resolves runtimeEnv and the API client against the overlaid URL', async () => {
    Object.assign(globalThis, {
      [RUNTIME_CONFIG_GLOBAL]: { [ENV_KEYS.apiUrl]: RUNTIME_API, [ENV_KEYS.title]: 'Staging' },
    })
    vi.resetModules()
    server.use(http.get(`${RUNTIME_API}/ping`, () => HttpResponse.json({ pong: true })))

    const { runtimeEnv } = await import('~/lib/config')
    const { appConfig } = await import('~/config/app.config')
    const { apiFetch } = await import('~/lib/api/client')

    expect(runtimeEnv.apiUrl).toBe(RUNTIME_API)
    expect(appConfig.apiUrl).toBe(RUNTIME_API)
    expect(appConfig.title).toBe('Staging')
    // `onUnhandledRequest: 'error'` fails this unless the request went to the
    // overlaid origin and path.
    await expect(apiFetch('/ping')).resolves.toEqual({ pong: true })
  })

  it('is exactly the built configuration when the overlay is empty', async () => {
    const baseline = (await import('~/lib/config')).runtimeEnv

    Object.assign(globalThis, { [RUNTIME_CONFIG_GLOBAL]: {} })
    vi.resetModules()
    const { runtimeEnv } = await import('~/lib/config')

    expect(runtimeEnv).toEqual(baseline)
  })
})
