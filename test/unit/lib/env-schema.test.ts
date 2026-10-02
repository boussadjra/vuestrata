import { describe, expect, it, vi } from 'vite-plus/test'

import {
  ENV_KEYS,
  isDemoRuntime,
  parseRuntimeEnv,
  resolveRuntimeEnv,
} from '~/lib/config/env.schema'

/**
 * The env schema is the boundary that decides which of the two artifacts a
 * build produces. It runs twice with deliberately different failure modes:
 * strict at build time (`parseRuntimeEnv`, throws) and lenient in the browser
 * (`resolveRuntimeEnv`, warns and corrects). Both must agree on what is valid.
 */

const demoEnv = {
  [ENV_KEYS.runtimeMode]: 'demo',
  [ENV_KEYS.useMocks]: 'true',
  [ENV_KEYS.authAdapter]: 'mock',
}

const productionEnv = {
  [ENV_KEYS.runtimeMode]: 'production',
  [ENV_KEYS.useMocks]: 'false',
  [ENV_KEYS.authAdapter]: 'jwt',
  [ENV_KEYS.apiUrl]: 'https://api.acme.test',
}

describe('parseRuntimeEnv (strict, build time)', () => {
  it('accepts a valid demo configuration', () => {
    const env = parseRuntimeEnv(demoEnv)
    expect(env.runtimeMode).toBe('demo')
    expect(env.useMocks).toBe(true)
    expect(env.authAdapter).toBe('mock')
    expect(isDemoRuntime(env)).toBe(true)
  })

  it('accepts a valid production configuration', () => {
    const env = parseRuntimeEnv(productionEnv)
    expect(env.runtimeMode).toBe('production')
    expect(env.useMocks).toBe(false)
    expect(env.authAdapter).toBe('jwt')
    expect(isDemoRuntime(env)).toBe(false)
  })

  it('defaults to demo in dev and production in a build', () => {
    expect(parseRuntimeEnv({}, { isDev: true }).runtimeMode).toBe('demo')
    expect(parseRuntimeEnv({ [ENV_KEYS.apiUrl]: '/api' }, { isDev: false }).runtimeMode).toBe(
      'production',
    )
  })

  it('derives useMocks and authAdapter from the mode so one variable is enough', () => {
    const demo = parseRuntimeEnv({ [ENV_KEYS.runtimeMode]: 'demo' })
    expect(demo.useMocks).toBe(true)
    expect(demo.authAdapter).toBe('mock')
  })

  // The combination rules — none of these were checked before.
  it('rejects the mock adapter in production, because its endpoints only exist in MSW', () => {
    expect(() => parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.authAdapter]: 'mock' })).toThrow(
      /mock.*not valid in production/i,
    )
  })

  it('rejects mocks enabled in production, because MSW is not bundled there', () => {
    expect(() => parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.useMocks]: 'true' })).toThrow(
      /must be "false"/i,
    )
  })

  it('rejects mocks disabled in demo mode, because there is no backend', () => {
    expect(() => parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.useMocks]: 'false' })).toThrow(
      /must be "true"/i,
    )
  })

  it('rejects a non-mock adapter in demo mode', () => {
    expect(() => parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.authAdapter]: 'jwt' })).toThrow(
      /must be "mock"/i,
    )
  })

  it('rejects a placeholder API host in production', () => {
    for (const apiUrl of ['http://localhost:3000/api', 'https://api.example.com']) {
      expect(() => parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.apiUrl]: apiUrl })).toThrow(
        /placeholder host/i,
      )
    }
  })

  it('allows a same-origin path in production — that means "behind a proxy"', () => {
    expect(parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.apiUrl]: '/api' }).apiUrl).toBe('/api')
  })

  it('rejects an API URL that is neither absolute nor a path', () => {
    expect(() => parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.apiUrl]: 'api.acme.test' })).toThrow(
      /neither an absolute URL nor a same-origin path/i,
    )
  })

  it('rejects values outside an allowlist', () => {
    expect(() => parseRuntimeEnv({ [ENV_KEYS.authAdapter]: 'saml' })).toThrow(
      /Invalid environment/i,
    )
    expect(() => parseRuntimeEnv({ [ENV_KEYS.useMocks]: 'yes' })).toThrow(/Invalid environment/i)
  })

  it('reports every field problem at once rather than one per build', () => {
    expect(() =>
      parseRuntimeEnv({ [ENV_KEYS.authAdapter]: 'saml', [ENV_KEYS.iconProvider]: 'fontawesome' }),
    ).toThrow(/VUESTRATA_AUTH_ADAPTER[\s\S]*VUESTRATA_ICON_PROVIDER/)
  })

  it('clamps demo retention to a sane range', () => {
    expect(
      parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.demoRetentionHours]: '48' }).demoAuth.retentionHours,
    ).toBe(48)
    expect(() => parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.demoRetentionHours]: '0' })).toThrow(
      /1–720 hours/,
    )
  })

  it('treats empty strings as unset rather than invalid', () => {
    const env = parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.title]: '' })
    expect(env.title).toBe('Vuestrata')
  })
})

describe('resolveRuntimeEnv (lenient, browser)', () => {
  it('never throws on an invalid combination — it corrects and warns', () => {
    const onWarn = vi.fn()
    const env = resolveRuntimeEnv({ ...productionEnv, [ENV_KEYS.authAdapter]: 'mock' }, { onWarn })

    expect(env.authAdapter).toBe('jwt')
    expect(onWarn).toHaveBeenCalledWith(expect.stringMatching(/not valid in production/i))
  })

  it('falls back to the default for an out-of-allowlist value', () => {
    const onWarn = vi.fn()
    const env = resolveRuntimeEnv(
      { ...demoEnv, [ENV_KEYS.iconProvider]: 'fontawesome' },
      { onWarn },
    )

    expect(env.iconProvider).toBe('solar')
    expect(onWarn).toHaveBeenCalledWith(expect.stringMatching(/VUESTRATA_ICON_PROVIDER/))
  })

  it('recovers when several fields are invalid at once', () => {
    const env = resolveRuntimeEnv({
      [ENV_KEYS.runtimeMode]: 'staging',
      [ENV_KEYS.authAdapter]: 'saml',
      [ENV_KEYS.demoRetentionHours]: 'soon',
    })

    expect(env.runtimeMode).toBe('production')
    expect(env.authAdapter).toBe('jwt')
    expect(env.demoAuth.retentionHours).toBe(24)
  })

  it('agrees with the strict parser on every valid configuration', () => {
    for (const raw of [demoEnv, productionEnv, {}]) {
      expect(resolveRuntimeEnv(raw)).toEqual(parseRuntimeEnv(raw))
    }
  })

  it('ignores non-string values instead of coercing them to "[object Object]"', () => {
    const env = resolveRuntimeEnv({ ...demoEnv, [ENV_KEYS.title]: { nope: true } })
    expect(env.title).toBe('Vuestrata')
  })
})

/**
 * `serving` is true under `vp dev`. A developer pointing production mode at a
 * backend on their own machine is the normal case there, and a build doing the
 * same is the mistake the placeholder rule exists to catch — so that one rule,
 * and only that one, depends on it.
 */
describe('serving (vp dev) versus building', () => {
  const localBackend = { ...productionEnv, [ENV_KEYS.apiUrl]: 'http://localhost:8000/api' }

  it('accepts a local backend with a real adapter while serving', () => {
    for (const apiUrl of [
      'http://localhost:8000/api',
      'http://127.0.0.1:3000',
      'http://0.0.0.0:8080',
    ]) {
      const env = parseRuntimeEnv(
        { ...productionEnv, [ENV_KEYS.apiUrl]: apiUrl },
        { serving: true },
      )
      expect(env.apiUrl).toBe(apiUrl)
      expect(env.authAdapter).toBe('jwt')
      expect(env.useMocks).toBe(false)
    }
  })

  it('leaves that URL alone in the browser rather than "correcting" it to /api', () => {
    const onWarn = vi.fn()
    const env = resolveRuntimeEnv(localBackend, { isDev: true, serving: true, onWarn })

    expect(env.apiUrl).toBe('http://localhost:8000/api')
    expect(onWarn).not.toHaveBeenCalled()
  })

  it('still rejects the same URL in a build, and names the dev proxy instead', () => {
    expect(() => parseRuntimeEnv(localBackend, { serving: false })).toThrow(
      /placeholder host "localhost"/,
    )
    // The message splits the rejected URL into the setup that works, so it can
    // be copied into .env.development.local as-is.
    expect(() => parseRuntimeEnv(localBackend)).toThrow(
      'VUESTRATA_API_URL=/api with DEV_API_TARGET=http://localhost:8000 in .env.development.local',
    )
  })

  it('does not suggest /api for a backend served from its root', () => {
    // The proxy forwards the path unchanged, so /api would reach a root-served
    // backend as /api/users instead of /users.
    const rootBackend = { ...localBackend, VUESTRATA_API_URL: 'http://localhost:8000' }

    expect(() => parseRuntimeEnv(rootBackend)).toThrow(/accepts this URL while serving/)
    expect(() => parseRuntimeEnv(rootBackend)).not.toThrow(/VUESTRATA_API_URL=\/api with/)
  })

  it('keeps that dev-server advice out of the browser, where it cannot help', () => {
    // Only the strict parser adds it. The lenient one ships in the bundle, and
    // a dev-only variable has no business being named there.
    const onWarn = vi.fn()
    resolveRuntimeEnv(localBackend, { onWarn })

    expect(onWarn).toHaveBeenCalledWith(expect.stringMatching(/placeholder host "localhost"/))
    expect(onWarn).not.toHaveBeenCalledWith(expect.stringMatching(/DEV_API_TARGET/))
  })

  it('relaxes nothing but the placeholder rule', () => {
    const serving = { serving: true }
    expect(() =>
      parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.apiUrl]: 'localhost/api' }, serving),
    ).toThrow(/neither an absolute URL nor a same-origin path/)
    expect(() =>
      parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.apiUrl]: 'ftp://localhost/api' }, serving),
    ).toThrow(/must use http or https/)
    expect(() =>
      parseRuntimeEnv({ ...localBackend, [ENV_KEYS.authAdapter]: 'mock' }, serving),
    ).toThrow(/mock.*not valid in production/i)
    expect(() =>
      parseRuntimeEnv({ ...localBackend, [ENV_KEYS.useMocks]: 'true' }, serving),
    ).toThrow(/must be "false"/)
  })

  it('still forces MSW and the mock adapter in demo mode', () => {
    const serving = { isDev: true, serving: true }
    expect(() => parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.useMocks]: 'false' }, serving)).toThrow(
      /must be "true"/,
    )
    expect(() => parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.authAdapter]: 'jwt' }, serving)).toThrow(
      /must be "mock"/,
    )

    const env = resolveRuntimeEnv(
      {
        ...demoEnv,
        [ENV_KEYS.useMocks]: 'false',
        [ENV_KEYS.authAdapter]: 'jwt',
        [ENV_KEYS.apiUrl]: 'http://localhost:8000/api',
      },
      serving,
    )
    expect(env.useMocks).toBe(true)
    expect(env.authAdapter).toBe('mock')
  })

  it('keeps the strict and lenient parsers in agreement while serving', () => {
    for (const raw of [demoEnv, productionEnv, localBackend, {}]) {
      expect(resolveRuntimeEnv(raw, { serving: true })).toEqual(
        parseRuntimeEnv(raw, { serving: true }),
      )
    }
  })
})

describe('adapters a project registered in auth.config.ts', () => {
  // What the Vite plugin reads from `app/config/auth.config.ts` and hands to
  // both parsers: each registered name, with the transport it declares.
  const authAdapters = { supabase: 'bearer', 'company-sso': 'cookie' } as const

  const withAdapter = (name: string, extra: Record<string, string> = {}) => ({
    ...productionEnv,
    [ENV_KEYS.authAdapter]: name,
    ...extra,
  })

  it('accepts a registered name, in the build and in the browser', () => {
    expect(parseRuntimeEnv(withAdapter('supabase'), { authAdapters }).authAdapter).toBe('supabase')

    const onWarn = vi.fn()
    const env = resolveRuntimeEnv(withAdapter('supabase'), { authAdapters, onWarn })
    expect(env.authAdapter).toBe('supabase')
    expect(onWarn).not.toHaveBeenCalled()
  })

  it('still accepts every built-in name alongside them', () => {
    expect(parseRuntimeEnv(withAdapter('jwt'), { authAdapters }).authAdapter).toBe('jwt')
    expect(parseRuntimeEnv(demoEnv, { authAdapters }).authAdapter).toBe('mock')
  })

  it('fails the build for a name nobody registered, and says where to register it', () => {
    const attempt = () => parseRuntimeEnv(withAdapter('firebase'), { authAdapters })

    expect(attempt).toThrow(/VUESTRATA_AUTH_ADAPTER: unknown auth adapter "firebase"/)
    expect(attempt).toThrow(/src\/modules\/app\/config\/auth\.config\.ts/)
  })

  it('knows no custom name at all when none is passed', () => {
    expect(() => parseRuntimeEnv(withAdapter('supabase'))).toThrow(/auth\.config\.ts/)
  })

  it('never answers an unknown name with the mock adapter in the browser', () => {
    const onWarn = vi.fn()
    const env = resolveRuntimeEnv(withAdapter('firebase'), { authAdapters, onWarn })

    // The mode default for production. Its endpoints exist; the mock's do not.
    expect(env.authAdapter).toBe('jwt')
    expect(onWarn).toHaveBeenCalledWith(expect.stringMatching(/unknown auth adapter "firebase"/))
  })

  it('does not treat an inherited property name as a registered adapter', () => {
    expect(() => parseRuntimeEnv(withAdapter('constructor'), { authAdapters })).toThrow(
      /unknown auth adapter "constructor"/,
    )
  })

  describe('the cross-field rules follow the declared transport', () => {
    it('refuses a bearer persistence strategy for a cookie-transport adapter', () => {
      // `refresh-cookie` is the production default, so leaving the variable
      // unset is the common way to get here.
      expect(() => parseRuntimeEnv(withAdapter('company-sso'), { authAdapters })).toThrow(
        /VUESTRATA_SESSION_PERSISTENCE="refresh-cookie" has no meaning with VUESTRATA_AUTH_ADAPTER="company-sso": that adapter uses cookie transport/,
      )
      expect(() =>
        parseRuntimeEnv(withAdapter('company-sso', { [ENV_KEYS.sessionPersistence]: 'local' }), {
          authAdapters,
        }),
      ).toThrow(/has no meaning with VUESTRATA_AUTH_ADAPTER="company-sso"/)
    })

    it('accepts that adapter once persistence is "none"', () => {
      const env = parseRuntimeEnv(
        withAdapter('company-sso', { [ENV_KEYS.sessionPersistence]: 'none' }),
        { authAdapters },
      )
      expect(env.authAdapter).toBe('company-sso')
      expect(env.sessionPersistence).toBe('none')
    })

    it('corrects it in the browser instead of throwing', () => {
      const onWarn = vi.fn()
      const env = resolveRuntimeEnv(withAdapter('company-sso'), { authAdapters, onWarn })

      expect(env.sessionPersistence).toBe('none')
      expect(onWarn).toHaveBeenCalledWith(expect.stringMatching(/cookie transport/))
    })

    it('leaves a bearer-transport adapter every persistence mode', () => {
      for (const mode of ['none', 'refresh-cookie', 'session', 'local']) {
        const env = parseRuntimeEnv(
          withAdapter('supabase', { [ENV_KEYS.sessionPersistence]: mode }),
          {
            authAdapters,
          },
        )
        expect(env.sessionPersistence).toBe(mode)
      }
    })

    it('words the built-in oauth rule exactly as before', () => {
      expect(() => parseRuntimeEnv(withAdapter('oauth'), { authAdapters })).toThrow(
        'VUESTRATA_SESSION_PERSISTENCE="refresh-cookie" has no meaning with ' +
          'VUESTRATA_AUTH_ADAPTER="oauth": that adapter uses cookie transport and resumes from ' +
          'its session cookie. Set it to "none".',
      )
    })

    it('still forbids the mock adapter in production', () => {
      expect(() => parseRuntimeEnv(withAdapter('mock'), { authAdapters })).toThrow(
        /mock.*not valid in production/i,
      )
    })

    it('still requires the mock adapter in a demo build, whatever is registered', () => {
      expect(() =>
        parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.authAdapter]: 'supabase' }, { authAdapters }),
      ).toThrow(/must be "mock".*received "supabase"/)
    })
  })

  it('keeps the strict and lenient parsers in agreement', () => {
    const valid = [
      withAdapter('supabase'),
      withAdapter('company-sso', { [ENV_KEYS.sessionPersistence]: 'none' }),
      withAdapter('jwt'),
      demoEnv,
    ]
    for (const raw of valid) {
      expect(resolveRuntimeEnv(raw, { authAdapters })).toEqual(
        parseRuntimeEnv(raw, { authAdapters }),
      )
    }
  })
})
