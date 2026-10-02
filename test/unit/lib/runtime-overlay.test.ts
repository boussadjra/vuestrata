import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import {
  ENV_KEYS,
  parseRuntimeEnv,
  resolveRuntimeEnv,
  SESSION_PERSISTENCE_MODES,
} from '~/lib/config/env.schema'
import {
  readRuntimeOverlay,
  resolveRuntimeEnvWithOverlay,
  RUNTIME_CONFIG_GLOBAL,
  RUNTIME_KEY_FORMATS,
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

  it('agrees with a plain merge when every runtime value is valid', () => {
    const overlay = readRuntimeOverlay(
      scope({ [ENV_KEYS.apiUrl]: 'https://api.runtime.test', [ENV_KEYS.release]: 'abc123' }),
    )

    expect(resolveRuntimeEnvWithOverlay(built, overlay)).toEqual(
      resolveRuntimeEnv({ ...built, ...overlay }),
    )
  })
})

describe('a start-time value that is invalid on its own', () => {
  /** A build that set every key a deployment may override. */
  const configured = {
    ...built,
    [ENV_KEYS.sessionPersistence]: 'none',
    [ENV_KEYS.errorReportingDsn]: 'https://key@errors.build.test/1',
    [ENV_KEYS.release]: 'built-release',
  }

  it('is dropped before the merge, so the BUILT value applies, not the default', () => {
    // Merged first, the typo would displace `none` and then fail validation,
    // and the key would fall through to the schema default: an image built for
    // a kiosk would resume sessions from a cookie.
    const onWarn = vi.fn()

    const resolved = resolveRuntimeEnvWithOverlay(
      configured,
      readRuntimeOverlay(scope({ [ENV_KEYS.sessionPersistence]: 'Session' })),
      { onWarn },
    )

    expect(resolved.sessionPersistence).toBe('none')
    expect(onWarn).toHaveBeenCalledTimes(1)
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`${ENV_KEYS.sessionPersistence} set at start.*built with applies`),
      ),
    )
  })

  it('costs one warning per key, naming it, and never a throw', () => {
    const onWarn = vi.fn()

    const resolved = resolveRuntimeEnvWithOverlay(
      configured,
      readRuntimeOverlay(
        scope({
          [ENV_KEYS.sessionPersistence]: 'forever',
          [ENV_KEYS.errorReportingDsn]: 'not a url',
          [ENV_KEYS.apiUrl]: 'ftp://files.test',
          [ENV_KEYS.title]: 'Kept',
        }),
      ),
      { onWarn },
    )

    expect(resolved.sessionPersistence).toBe('none')
    expect(resolved.errorReporting.dsn).toBe('https://key@errors.build.test/1')
    expect(resolved.apiUrl).toBe('https://api.build.test')
    // A valid value beside them is still taken.
    expect(resolved.title).toBe('Kept')
    expect(onWarn).toHaveBeenCalledTimes(3)
    for (const key of [ENV_KEYS.sessionPersistence, ENV_KEYS.errorReportingDsn, ENV_KEYS.apiUrl]) {
      expect(onWarn).toHaveBeenCalledWith(expect.stringContaining(`${key} set at start`))
    }
  })

  it('falls through to the default only when the build set nothing either', () => {
    const resolved = resolveRuntimeEnvWithOverlay(
      built,
      readRuntimeOverlay(scope({ [ENV_KEYS.sessionPersistence]: 'forever' })),
    )

    expect(resolved.sessionPersistence).toBe('refresh-cookie')
  })

  it.each([
    ['a protocol-relative URL', '//evil.test/api'],
    ['a backslash a browser reads as a slash', '/\\evil.test/api'],
    ['another scheme', 'javascript:alert(1)'],
    ['a bare host', 'api.acme.test'],
  ])('keeps the built API URL for %s', (_, apiUrl) => {
    const onWarn = vi.fn()

    const resolved = resolveRuntimeEnvWithOverlay(
      built,
      readRuntimeOverlay(scope({ [ENV_KEYS.apiUrl]: apiUrl })),
      { onWarn },
    )

    expect(resolved.apiUrl).toBe('https://api.build.test')
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining(ENV_KEYS.apiUrl))
  })

  it('still corrects a value that is only wrong in combination', () => {
    // `session` is a valid persistence mode; beside the oauth adapter it means
    // nothing. That is a rule about two keys, and it runs after the merge.
    const onWarn = vi.fn()

    const resolved = resolveRuntimeEnvWithOverlay(
      { ...built, [ENV_KEYS.authAdapter]: 'oauth', [ENV_KEYS.sessionPersistence]: 'none' },
      readRuntimeOverlay(scope({ [ENV_KEYS.sessionPersistence]: 'session' })),
      { onWarn },
    )

    expect(resolved.sessionPersistence).toBe('none')
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining('Auto-correcting'))
  })
})

describe('an API URL on a placeholder host', () => {
  const PLACEHOLDERS = [
    'http://localhost:8000',
    'http://127.0.0.1:8000/api',
    'http://0.0.0.0:8000',
    'https://api.example.com/v1',
  ]
  /** A production bundle, as a browser runs it: not dev, not served by Vite. */
  const shipped = { isDev: false, serving: false }
  const sameOriginBuild = { ...built, [ENV_KEYS.apiUrl]: '/api' }

  it.each(PLACEHOLDERS)('is honoured when it was set at start: %s', (apiUrl) => {
    // Whoever passed it to `docker run` chose it. The container's headers
    // already allow that origin; an app that fell back to /api would be
    // answered by its own server instead.
    const onWarn = vi.fn()

    const resolved = resolveRuntimeEnvWithOverlay(
      sameOriginBuild,
      readRuntimeOverlay(scope({ [ENV_KEYS.apiUrl]: apiUrl })),
      { ...shipped, onWarn },
    )

    expect(resolved.apiUrl).toBe(apiUrl)
    expect(onWarn).not.toHaveBeenCalled()
  })

  it.each(PLACEHOLDERS)('is still refused when a BUILD points at it: %s', (apiUrl) => {
    // The rule exists for a build nobody configured. That has not changed.
    const forgotten = { ...built, [ENV_KEYS.apiUrl]: apiUrl }
    const onWarn = vi.fn()

    expect(() => parseRuntimeEnv(forgotten, shipped)).toThrow(/placeholder host/)
    // And in the browser, with no overlay to vouch for it.
    expect(resolveRuntimeEnvWithOverlay(forgotten, {}, { ...shipped, onWarn }).apiUrl).toBe('/api')
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining('placeholder host'))
  })

  it('is not vouched for by some other key being set at start', () => {
    const forgotten = { ...built, [ENV_KEYS.apiUrl]: 'http://localhost:8000' }

    const resolved = resolveRuntimeEnvWithOverlay(
      forgotten,
      readRuntimeOverlay(scope({ [ENV_KEYS.title]: 'Staging' })),
      shipped,
    )

    expect(resolved.apiUrl).toBe('/api')
    expect(resolved.title).toBe('Staging')
  })

  it('relaxes nothing else: a mock adapter set at start is still ignored', () => {
    const resolved = resolveRuntimeEnvWithOverlay(
      sameOriginBuild,
      readRuntimeOverlay(
        scope({ [ENV_KEYS.apiUrl]: 'http://localhost:8000', [ENV_KEYS.authAdapter]: 'mock' }),
      ),
      shipped,
    )

    expect(resolved.authAdapter).toBe('jwt')
    expect(resolved.useMocks).toBe(false)
  })
})

describe('the formats the entrypoint is generated from', () => {
  it('lets a title hold spaces, and holds session persistence to the schema list', () => {
    expect(RUNTIME_KEY_FORMATS).toEqual({
      [ENV_KEYS.title]: { kind: 'text' },
      [ENV_KEYS.sessionPersistence]: { kind: 'enum', values: SESSION_PERSISTENCE_MODES },
    })
  })

  it('names only keys a deployment may set at start', () => {
    for (const key of Object.keys(RUNTIME_KEY_FORMATS)) {
      expect(RUNTIME_OVERRIDABLE_KEYS).toContain(key)
    }
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

  it('keeps what the build set when the value given at start is not one', async () => {
    vi.stubEnv(ENV_KEYS.runtimeMode, 'production')
    vi.stubEnv(ENV_KEYS.useMocks, 'false')
    vi.stubEnv(ENV_KEYS.authAdapter, 'jwt')
    vi.stubEnv(ENV_KEYS.sessionPersistence, 'session')
    Object.assign(globalThis, {
      [RUNTIME_CONFIG_GLOBAL]: { [ENV_KEYS.sessionPersistence]: 'Session' },
    })
    vi.resetModules()

    try {
      const { runtimeEnv } = await import('~/lib/config')

      // Not `refresh-cookie`, the schema default: the build's own choice.
      expect(runtimeEnv.sessionPersistence).toBe('session')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('is exactly the built configuration when the overlay is empty', async () => {
    const baseline = (await import('~/lib/config')).runtimeEnv

    Object.assign(globalThis, { [RUNTIME_CONFIG_GLOBAL]: {} })
    vi.resetModules()
    const { runtimeEnv } = await import('~/lib/config')

    expect(runtimeEnv).toEqual(baseline)
  })
})
