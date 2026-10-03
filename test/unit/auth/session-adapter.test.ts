import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { apiOriginUrl, resolveApiBaseUrl } from '@/lib/api/base-url'
import {
  createAuthEndpoints,
  endpointPresets,
  installAuthConfig,
  resolveAuthConfig,
  resolveAuthEndpoints,
} from '@/lib/auth'
import {
  createAuthAdapter,
  loadAuthAdapter,
  registeredAuthAdapters,
  resolveAuthAdapterName,
  SUPPORTED_AUTH_ADAPTERS,
} from '@/modules/auth/adapters'
import { createSessionAdapter } from '@/modules/auth/adapters/session'
import { AUTH_ADAPTERS } from '~/lib/config'

/**
 * The `session` adapter's place in the registry, and the endpoint table it is
 * configured with. What it puts on the wire is
 * `test/integration/auth/session-adapter.test.ts`.
 */

afterEach(() => {
  installAuthConfig(resolveAuthConfig())
  vi.unstubAllGlobals()
})

describe('the session adapter in the registry', () => {
  it('is one of the built-in names the build accepts', () => {
    expect(AUTH_ADAPTERS).toContain('session')
    expect(SUPPORTED_AUTH_ADAPTERS).toContain('session')
  })

  it('is built by name in a bundle made for it', async () => {
    vi.stubGlobal('__VUESTRATA_SESSION_ADAPTER__', true)

    const adapter = createAuthAdapter('session')

    expect(adapter.name).toBe('session')
    expect(adapter.transport).toBe('cookie')
    expect(resolveAuthAdapterName('session')).toBe('session')
    expect(registeredAuthAdapters()).toEqual(['mock', 'jwt', 'oauth', 'session'])
    await expect(loadAuthAdapter('session')).resolves.toBeUndefined()
  })

  it('is listed after the adapters a production bundle always has', () => {
    vi.stubGlobal('__VUESTRATA_SESSION_ADAPTER__', true)
    vi.stubGlobal('__VUESTRATA_DEMO__', false)

    expect(registeredAuthAdapters()).toEqual(['jwt', 'oauth', 'session'])
    expect(() => createAuthAdapter('saml')).toThrow(/Built in: jwt, oauth, session\./)
  })

  it('is not in a bundle built for another adapter, and says how to get it', () => {
    vi.stubGlobal('__VUESTRATA_SESSION_ADAPTER__', false)

    expect(registeredAuthAdapters()).not.toContain('session')
    expect(() => createAuthAdapter('session')).toThrow(
      /VUESTRATA_AUTH_ADAPTER="session" is not in this bundle.*rebuild with it set/,
    )
  })

  it('stays in beside a Vite plugin that does not set the constant', () => {
    // A project that edited its copy of the plugin keeps the 1.0 one, which
    // defines nothing: the adapter the build accepted has to be buildable.
    vi.stubGlobal('__VUESTRATA_SESSION_ADAPTER__', undefined)

    expect(createAuthAdapter('session').name).toBe('session')
  })

  it('cannot be replaced by an adapter of the project’s own', () => {
    expect(() =>
      resolveAuthConfig({ adapters: { session: () => createSessionAdapter() } }),
    ).toThrow(/"session" is a built-in adapter and cannot be replaced/)
  })
})

describe('endpointPresets.sanctum', () => {
  it('is Sanctum’s routes: the session routes at the origin, the user under the API', () => {
    expect(resolveAuthEndpoints(endpointPresets.sanctum)).toStrictEqual({
      login: { path: '/login', method: 'POST', base: 'origin' },
      register: { path: '/register', method: 'POST', base: 'origin' },
      logout: { path: '/logout', method: 'POST', base: 'origin' },
      me: { path: '/user' },
      refresh: null,
      magicLink: null,
      magicLinkVerify: null,
      mfaSetup: null,
      mfaVerify: null,
      mfaDisable: null,
      authorize: null,
      providerAuthorize: null,
      token: null,
    })
  })

  it('can be spread, to change a route and keep the rest', () => {
    const spec = resolveAuthEndpoints({ ...endpointPresets.sanctum, me: '/me', register: null })

    expect(spec.me).toStrictEqual({ path: '/me' })
    expect(spec.register).toBeNull()
    expect(spec.login).toStrictEqual({ path: '/login', method: 'POST', base: 'origin' })
  })
})

describe('an endpoint beside the API (`base`)', () => {
  it('is kept on the table only when it says "origin"', () => {
    const spec = resolveAuthEndpoints({
      login: { path: '/session', base: 'origin' },
      logout: { path: '/session', method: 'DELETE', base: 'api' },
    })

    expect(spec.login).toStrictEqual({ path: '/session', method: 'POST', base: 'origin' })
    expect(spec.logout).toStrictEqual({ path: '/session', method: 'DELETE' })
  })

  it.each([
    [
      'a base that is neither',
      { login: { path: '/login', base: 'root' as 'origin' } },
      /the "login" endpoint has base "root"/,
    ],
    [
      'an absolute URL, which is used as it is',
      { login: { path: 'https://id.example.test/login', base: 'origin' as const } },
      /the "login" endpoint is an absolute URL/,
    ],
    [
      'the address a browser is sent to',
      { authorize: { path: '/oauth/authorize', base: 'origin' as const } },
      /`base` does not apply to the "authorize" endpoint/,
    ],
  ])('refuses %s, naming auth.config.ts', (_, overrides, message) => {
    expect(() => resolveAuthEndpoints(overrides)).toThrow(message)
    expect(() => resolveAuthEndpoints(overrides)).toThrow(/^auth\.config\.ts: /)
  })

  it('builds its calls for any table, with or without one', () => {
    expect(() => createAuthEndpoints(endpointPresets.sanctum)).not.toThrow()
    expect(Object.keys(createAuthEndpoints().cookieSession)).toEqual([
      'login',
      'register',
      'verifyMagicLink',
      'verifyMfa',
    ])
  })
})

describe('an address on the API’s origin', () => {
  it('is the page’s own for a same-origin API URL, whatever path the API is under', () => {
    const base = resolveApiBaseUrl('/api/v1')

    expect(base).toBe(`${window.location.origin}/api/v1`)
    expect(apiOriginUrl('/login', base)).toBe(`${window.location.origin}/login`)
    expect(apiOriginUrl('/sanctum/csrf-cookie', base)).toBe(
      `${window.location.origin}/sanctum/csrf-cookie`,
    )
  })

  it('is the API’s for an absolute API URL, at its root and not under its path', () => {
    const base = resolveApiBaseUrl('https://api.example.test:8443/api')

    expect(base).toBe('https://api.example.test:8443/api')
    expect(apiOriginUrl('/login', base)).toBe('https://api.example.test:8443/login')
    expect(apiOriginUrl('login', base)).toBe('https://api.example.test:8443/login')
  })

  it('gives the path back for a base it cannot parse, rather than throwing', () => {
    expect(apiOriginUrl('/login', 'not a url')).toBe('/login')
  })
})
