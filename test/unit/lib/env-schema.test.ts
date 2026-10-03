import { describe, expect, it, vi } from 'vite-plus/test'

import {
  describeEnvValueIssue,
  ENV_KEYS,
  isDemoRuntime,
  isHybridRuntime,
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

  it.each([
    ['a protocol-relative URL', '//evil.test/api'],
    ['a backslash a browser reads as a second slash', '/\\evil.test/api'],
    ['three slashes', '///evil.test'],
  ])('does not take %s for a same-origin path', (_, apiUrl) => {
    // It starts with "/", and a browser sends every request to that host.
    for (const serving of [false, true]) {
      expect(() =>
        parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.apiUrl]: apiUrl }, { serving }),
      ).toThrow(/names another host/)
    }

    const onWarn = vi.fn()
    const lenient = resolveRuntimeEnv({ ...productionEnv, [ENV_KEYS.apiUrl]: apiUrl }, { onWarn })
    expect(lenient.apiUrl).toBe('/api')
    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining('names another host'))
  })

  it.each(['/api', '/api/v1/', '/', '/a\\b'])('still takes %s for one', (apiUrl) => {
    expect(parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.apiUrl]: apiUrl }).apiUrl).toBe(apiUrl)
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
describe('describeEnvValueIssue (one value, on its own)', () => {
  it.each([
    [ENV_KEYS.sessionPersistence, 'session'],
    [ENV_KEYS.title, 'Acme Console'],
    [ENV_KEYS.apiUrl, '/backend'],
    [ENV_KEYS.apiUrl, 'https://api.acme.test/v1'],
    // A placeholder host is a rule about a build nobody configured, not about
    // the value.
    [ENV_KEYS.apiUrl, 'http://localhost:8000'],
    [ENV_KEYS.errorReportingDsn, 'https://key@errors.acme.test/1'],
    // Not a key the schema knows: nothing to say about it.
    ['VUESTRATA_FEATURE_X', 'anything'],
  ])('finds nothing wrong with %s=%s', (key, value) => {
    expect(describeEnvValueIssue(key, value)).toBeNull()
  })

  it.each([
    [ENV_KEYS.sessionPersistence, 'Session'],
    [ENV_KEYS.errorReportingDsn, 'not a url'],
    [ENV_KEYS.apiUrl, 'ftp://files.acme.test'],
    [ENV_KEYS.apiUrl, '//evil.test/api'],
    [ENV_KEYS.apiUrl, 'api.acme.test'],
    [ENV_KEYS.authAdapter, 'saml'],
  ])('says what is wrong with %s=%s', (key, value) => {
    expect(describeEnvValueIssue(key, value)).toEqual(expect.any(String))
  })
})

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

/**
 * `VUESTRATA_MOCK_ONLY` lists the modules MSW answers for while a real backend,
 * signed in to through a real adapter, answers for everything else. It is a
 * variation of the demo build, and a production build refuses it.
 */
describe('VUESTRATA_MOCK_ONLY: some modules mocked beside a real backend', () => {
  const authAdapters = { supabase: 'bearer', 'company-sso': 'cookie' } as const

  const hybridEnv = {
    [ENV_KEYS.runtimeMode]: 'demo',
    [ENV_KEYS.authAdapter]: 'jwt',
    [ENV_KEYS.apiUrl]: '/api',
    [ENV_KEYS.mockOnly]: 'orders,reports',
  }

  describe('the list', () => {
    it('is empty when the variable is unset, in both targets', () => {
      expect(parseRuntimeEnv(demoEnv).mockOnly).toEqual([])
      expect(parseRuntimeEnv(productionEnv).mockOnly).toEqual([])
      expect(isHybridRuntime(parseRuntimeEnv(demoEnv))).toBe(false)
      expect(isHybridRuntime(parseRuntimeEnv(productionEnv))).toBe(false)
    })

    it('is trimmed, keeps its order and drops duplicates', () => {
      const env = parseRuntimeEnv({
        ...hybridEnv,
        [ENV_KEYS.mockOnly]: ' reports , orders,reports ,, team-members ',
      })

      expect(env.mockOnly).toEqual(['reports', 'orders', 'team-members'])
      expect(isHybridRuntime(env)).toBe(true)
    })

    it.each(['', '   ', ',', ' , ,'])('reads %j as unset', (value) => {
      // With no list this is an ordinary demo, which signs in with `mock`.
      const env = parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.mockOnly]: value })

      expect(env.mockOnly).toEqual([])
      expect(isHybridRuntime(env)).toBe(false)
    })

    it.each(['Orders', 'orders reports', 'orders;reports', '../orders', '1st', 'orders/*', '-x'])(
      'fails the build for the malformed id in %j, naming the variable',
      (value) => {
        expect(() => parseRuntimeEnv({ ...hybridEnv, [ENV_KEYS.mockOnly]: value })).toThrow(
          /VUESTRATA_MOCK_ONLY: expected module ids separated by commas/,
        )
      },
    )

    it('names the malformed ids, and only those', () => {
      expect(() =>
        parseRuntimeEnv({ ...hybridEnv, [ENV_KEYS.mockOnly]: 'orders,Reports,my_module' }),
      ).toThrow(/received "Reports", "my_module"$/m)
    })

    it('ignores a malformed list in the browser, with a warning, rather than mock a guess', () => {
      const onWarn = vi.fn()
      const env = resolveRuntimeEnv({ ...demoEnv, [ENV_KEYS.mockOnly]: 'Orders' }, { onWarn })

      expect(env.mockOnly).toEqual([])
      expect(env.authAdapter).toBe('mock')
      expect(onWarn).toHaveBeenCalledWith(
        expect.stringMatching(/Ignoring invalid VUESTRATA_MOCK_ONLY/),
      )
    })

    it('is checked as a value on its own, too', () => {
      expect(describeEnvValueIssue(ENV_KEYS.mockOnly, 'orders,reports')).toBeNull()
      expect(describeEnvValueIssue(ENV_KEYS.mockOnly, 'Orders')).toMatch(/expected module ids/)
    })
  })

  describe('the hybrid build', () => {
    it('is a demo build with mocks on, a real adapter and the listed modules', () => {
      const env = parseRuntimeEnv(hybridEnv)

      expect(env).toMatchObject({
        runtimeMode: 'demo',
        useMocks: true,
        authAdapter: 'jwt',
        mockOnly: ['orders', 'reports'],
      })
      // MSW is compiled in, as in any demo build.
      expect(isDemoRuntime(env)).toBe(true)
      expect(isHybridRuntime(env)).toBe(true)
    })

    it('needs only the list while developing: the adapter defaults to a real one', () => {
      const env = parseRuntimeEnv({ [ENV_KEYS.mockOnly]: 'orders' }, { isDev: true })

      expect(env).toMatchObject({
        runtimeMode: 'demo',
        useMocks: true,
        authAdapter: 'jwt',
        // The default of a real deployment, not the demo's `none`.
        sessionPersistence: 'refresh-cookie',
        mockOnly: ['orders'],
      })
    })

    it.each(['none', 'refresh-cookie', 'session', 'local'])(
      'leaves a bearer adapter the "%s" session persistence, which a demo may not have',
      (mode) => {
        const env = parseRuntimeEnv({ ...hybridEnv, [ENV_KEYS.sessionPersistence]: mode })
        expect(env.sessionPersistence).toBe(mode)
      },
    )

    it('accepts oauth and an adapter the project registered', () => {
      const cookie = { [ENV_KEYS.sessionPersistence]: 'none' }

      expect(
        parseRuntimeEnv({ ...hybridEnv, ...cookie, [ENV_KEYS.authAdapter]: 'oauth' }).authAdapter,
      ).toBe('oauth')
      expect(
        parseRuntimeEnv({ ...hybridEnv, [ENV_KEYS.authAdapter]: 'supabase' }, { authAdapters })
          .authAdapter,
      ).toBe('supabase')
      expect(
        parseRuntimeEnv(
          { ...hybridEnv, ...cookie, [ENV_KEYS.authAdapter]: 'company-sso' },
          { authAdapters },
        ).authAdapter,
      ).toBe('company-sso')
    })

    it('holds a cookie-transport adapter to the rule production holds it to', () => {
      expect(() =>
        parseRuntimeEnv({ ...hybridEnv, [ENV_KEYS.authAdapter]: 'company-sso' }, { authAdapters }),
      ).toThrow(/has no meaning with VUESTRATA_AUTH_ADAPTER="company-sso"/)

      const onWarn = vi.fn()
      const env = resolveRuntimeEnv(
        { ...hybridEnv, [ENV_KEYS.authAdapter]: 'oauth', [ENV_KEYS.sessionPersistence]: 'local' },
        { onWarn },
      )
      expect(env).toMatchObject({ authAdapter: 'oauth', sessionPersistence: 'none' })
      expect(env.mockOnly).toEqual(['orders', 'reports'])
      expect(onWarn).toHaveBeenCalledTimes(1)
    })

    it('holds the API URL to what a real backend needs', () => {
      const withUrl = (apiUrl: string) => ({ ...hybridEnv, [ENV_KEYS.apiUrl]: apiUrl })

      // A build that still points at a placeholder would deploy an app with no API.
      expect(() => parseRuntimeEnv(withUrl('http://localhost:8000/api'))).toThrow(
        /VUESTRATA_API_URL is not usable with a real backend: .*placeholder host "localhost"/,
      )
      // While serving, a backend on the developer's machine is the normal case.
      expect(parseRuntimeEnv(withUrl('http://localhost:8000/api'), { serving: true }).apiUrl).toBe(
        'http://localhost:8000/api',
      )
      expect(parseRuntimeEnv(withUrl('https://staging.acme.test/v1')).apiUrl).toBe(
        'https://staging.acme.test/v1',
      )
      for (const serving of [false, true]) {
        expect(() => parseRuntimeEnv(withUrl('//evil.test/api'), { serving })).toThrow(
          /names another host/,
        )
      }
    })

    it('still leaves the API URL of a self-contained demo unchecked', () => {
      const env = parseRuntimeEnv({ ...demoEnv, [ENV_KEYS.apiUrl]: 'https://api.example.com' })
      expect(env.apiUrl).toBe('https://api.example.com')
    })
  })

  /**
   * Every combination of mode, mocks, adapter and list, with the sentence that
   * refuses it. `null` is a valid configuration. The same table is in
   * docs/1.getting-started/4.develop-against-your-backend.md.
   */
  describe('the truth table', () => {
    const MODES = ['demo', 'production'] as const
    const MOCKS = ['true', 'false'] as const
    const ADAPTERS = ['mock', 'jwt', 'supabase'] as const
    const LISTS = [undefined, 'orders', 'orders,auth'] as const

    type Row = {
      mode: (typeof MODES)[number]
      mocks: (typeof MOCKS)[number]
      adapter: (typeof ADAPTERS)[number]
      list: (typeof LISTS)[number]
    }

    /** What must refuse the row, or an empty list when the row is valid. */
    function refusals({ mode, mocks, adapter, list }: Row): RegExp[] {
      const real = adapter !== 'mock'

      if (mode === 'production') {
        return [
          ...(list
            ? [/VUESTRATA_MOCK_ONLY is not valid when VUESTRATA_RUNTIME_MODE="production"/]
            : []),
          ...(mocks === 'true' ? [/VUESTRATA_USE_MOCKS must be "false"/] : []),
          ...(real ? [] : [/VUESTRATA_AUTH_ADAPTER="mock" is not valid in production/]),
        ]
      }

      // demo, with a list and a real adapter: hybrid.
      if (list && real) {
        return [
          ...(mocks === 'false'
            ? [/VUESTRATA_USE_MOCKS must be "true" when VUESTRATA_MOCK_ONLY is set/]
            : []),
          ...(list.includes('auth') ? [/VUESTRATA_MOCK_ONLY cannot name "auth"/] : []),
        ]
      }

      // demo, otherwise: the self-contained demo and its rules.
      return [
        ...(list ? [/VUESTRATA_MOCK_ONLY needs a real auth adapter/] : []),
        ...(mocks === 'false'
          ? [/VUESTRATA_USE_MOCKS must be "true" when VUESTRATA_RUNTIME_MODE="demo"/]
          : []),
        ...(real
          ? [/VUESTRATA_AUTH_ADAPTER must be "mock" when VUESTRATA_RUNTIME_MODE="demo"/]
          : []),
      ]
    }

    const ROWS: Row[] = MODES.flatMap((mode) =>
      MOCKS.flatMap((mocks) =>
        ADAPTERS.flatMap((adapter) => LISTS.map((list) => ({ mode, mocks, adapter, list }))),
      ),
    )

    const rawOf = ({ mode, mocks, adapter, list }: Row) => ({
      [ENV_KEYS.runtimeMode]: mode,
      [ENV_KEYS.useMocks]: mocks,
      [ENV_KEYS.authAdapter]: adapter,
      [ENV_KEYS.apiUrl]: '/api',
      // Set, so no row fails on a default nobody is testing here.
      [ENV_KEYS.sessionPersistence]: 'none',
      ...(list ? { [ENV_KEYS.mockOnly]: list } : {}),
    })

    /** A resolved environment, written back as the variables that produce it. */
    const asRaw = (env: ReturnType<typeof resolveRuntimeEnv>) => ({
      [ENV_KEYS.runtimeMode]: env.runtimeMode,
      [ENV_KEYS.useMocks]: String(env.useMocks),
      [ENV_KEYS.authAdapter]: env.authAdapter,
      [ENV_KEYS.apiUrl]: env.apiUrl,
      [ENV_KEYS.sessionPersistence]: env.sessionPersistence,
      [ENV_KEYS.mockOnly]: env.mockOnly.join(','),
    })

    it('covers every combination', () => {
      expect(ROWS).toHaveLength(36)
      // The valid ones: the demo, production, and hybrid with either real adapter.
      expect(ROWS.filter((row) => refusals(row).length === 0)).toEqual([
        { mode: 'demo', mocks: 'true', adapter: 'mock', list: undefined },
        { mode: 'demo', mocks: 'true', adapter: 'jwt', list: 'orders' },
        { mode: 'demo', mocks: 'true', adapter: 'supabase', list: 'orders' },
        { mode: 'production', mocks: 'false', adapter: 'jwt', list: undefined },
        { mode: 'production', mocks: 'false', adapter: 'supabase', list: undefined },
      ])
    })

    it.each(ROWS)('build: mode=$mode mocks=$mocks adapter=$adapter list=$list', (row) => {
      const expected = refusals(row)
      const attempt = () => parseRuntimeEnv(rawOf(row), { authAdapters })

      if (expected.length === 0) {
        expect(attempt).not.toThrow()
        return
      }
      for (const pattern of expected) expect(attempt).toThrow(pattern)
      // And nothing else: one line per broken rule.
      let message = ''
      try {
        attempt()
      } catch (error) {
        message = (error as Error).message
      }
      expect(message.split('\n  - ')).toHaveLength(expected.length + 1)
    })

    it.each(ROWS)('browser: mode=$mode mocks=$mocks adapter=$adapter list=$list', (row) => {
      const expected = refusals(row)
      const onWarn = vi.fn()
      const env = resolveRuntimeEnv(rawOf(row), { authAdapters, onWarn })

      // One warning per broken rule, and none for a valid row.
      expect(onWarn).toHaveBeenCalledTimes(expected.length)
      for (const pattern of expected) {
        expect(onWarn).toHaveBeenCalledWith(expect.stringMatching(pattern))
      }
      // Whatever it was corrected to is something a build would accept.
      expect(() => parseRuntimeEnv(asRaw(env), { authAdapters })).not.toThrow()
      if (expected.length === 0) {
        expect(env).toEqual(parseRuntimeEnv(rawOf(row), { authAdapters }))
      }
      // Never a list in production, with the mock adapter, or naming auth.
      if (env.runtimeMode === 'production' || env.authAdapter === 'mock') {
        expect(env.mockOnly).toEqual([])
      }
      expect(env.mockOnly).not.toContain('auth')
    })
  })

  describe('what the refusals say', () => {
    it('fails a production build with a message that names the variable and the way out', () => {
      const attempt = () => parseRuntimeEnv({ ...productionEnv, [ENV_KEYS.mockOnly]: 'orders' })

      expect(attempt).toThrow(
        'VUESTRATA_MOCK_ONLY is not valid when VUESTRATA_RUNTIME_MODE="production": MSW and the ' +
          'mock handlers are not bundled in a production build. Remove it, or set ' +
          'VUESTRATA_RUNTIME_MODE="demo" to mock those modules beside a real backend.',
      )
    })

    it('fails a build that sets the list and leaves the mode to default to production', () => {
      // `vp build` with no VUESTRATA_RUNTIME_MODE is a production build.
      expect(() => parseRuntimeEnv({ [ENV_KEYS.mockOnly]: 'orders' }, { isDev: false })).toThrow(
        /VUESTRATA_MOCK_ONLY is not valid when VUESTRATA_RUNTIME_MODE="production"/,
      )
    })

    it('refuses it under vp dev in production mode as well, where MSW is compiled out too', () => {
      expect(() =>
        parseRuntimeEnv(
          { ...productionEnv, [ENV_KEYS.mockOnly]: 'orders' },
          { isDev: true, serving: true },
        ),
      ).toThrow(/VUESTRATA_MOCK_ONLY is not valid/)
    })

    it('drops the list in a production bundle that somehow carries one', () => {
      const onWarn = vi.fn()
      const env = resolveRuntimeEnv({ ...productionEnv, [ENV_KEYS.mockOnly]: 'orders' }, { onWarn })

      expect(env.mockOnly).toEqual([])
      expect(env).toEqual(resolveRuntimeEnv(productionEnv))
    })

    it('refuses the mock adapter beside a list once, not again for defaults nobody chose', () => {
      const attempt = () =>
        parseRuntimeEnv({
          [ENV_KEYS.runtimeMode]: 'demo',
          [ENV_KEYS.authAdapter]: 'mock',
          [ENV_KEYS.mockOnly]: 'orders',
        })

      expect(attempt).toThrow(
        'VUESTRATA_MOCK_ONLY needs a real auth adapter, and VUESTRATA_AUTH_ADAPTER is "mock": ' +
          'the modules it lists are mocked beside a real backend, and the mock adapter signs in ' +
          'against MSW alone. Set VUESTRATA_AUTH_ADAPTER to "jwt", "oauth" or an adapter of your ' +
          'own, or remove VUESTRATA_MOCK_ONLY for the self-contained demo.',
      )
      expect(attempt).not.toThrow(/VUESTRATA_SESSION_PERSISTENCE/)
    })

    it('falls back to the self-contained demo in the browser for that combination', () => {
      const env = resolveRuntimeEnv({ ...demoEnv, [ENV_KEYS.mockOnly]: 'orders' })

      expect(env).toEqual(resolveRuntimeEnv(demoEnv))
    })

    it('refuses "auth" in the list, and says why', () => {
      expect(() => parseRuntimeEnv({ ...hybridEnv, [ENV_KEYS.mockOnly]: 'orders,auth' })).toThrow(
        'VUESTRATA_MOCK_ONLY cannot name "auth" with VUESTRATA_AUTH_ADAPTER="jwt": the mock ' +
          'sign-in endpoints and a real adapter cannot both own /auth/*. Remove "auth" from the list.',
      )
    })

    it('drops "auth" from the list in the browser and keeps the rest', () => {
      const env = resolveRuntimeEnv({ ...hybridEnv, [ENV_KEYS.mockOnly]: 'orders,auth' })

      expect(env).toMatchObject({ authAdapter: 'jwt', mockOnly: ['orders'] })
    })

    it('becomes the self-contained demo in the browser when "auth" was the whole list', () => {
      const env = resolveRuntimeEnv({
        ...hybridEnv,
        [ENV_KEYS.mockOnly]: 'auth',
        [ENV_KEYS.sessionPersistence]: 'local',
      })

      expect(env).toMatchObject({
        runtimeMode: 'demo',
        useMocks: true,
        authAdapter: 'mock',
        sessionPersistence: 'none',
        mockOnly: [],
      })
    })

    it('points a demo build with a real adapter at the list, in the build only', () => {
      const raw = { ...demoEnv, [ENV_KEYS.authAdapter]: 'jwt' }

      expect(() => parseRuntimeEnv(raw)).toThrow(
        /must be "mock".*To keep a real adapter and mock only the modules your backend has not built yet, set VUESTRATA_MOCK_ONLY/,
      )

      // The browser can do nothing with the advice, and its bundle stays as it was.
      const onWarn = vi.fn()
      resolveRuntimeEnv(raw, { onWarn })
      expect(onWarn).not.toHaveBeenCalledWith(expect.stringMatching(/VUESTRATA_MOCK_ONLY/))
    })
  })
})
