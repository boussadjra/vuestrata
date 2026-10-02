import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { AuthEndpointOverrides, AuthEndpoints } from '@/modules/auth/adapters/endpoints'
import type { SessionPersistence } from '~/lib/config'

/**
 * The endpoint table: where each auth request goes.
 *
 * The paths and methods were literals inside `adapters/base.ts`. A backend
 * with `/api/v1/session` or `/users/me` had nowhere to say so. They are now a
 * table a project overrides from `app/config/auth.config.ts`, and the first
 * thing to hold on to is that the table it starts from is the old literals.
 */

const user = { id: 'u1', email: 'a@b.test', name: 'A', role: 'member' }
const session = { user, token: 'access', refreshToken: 'refresh', expiresIn: 900 }

// A backend's answers: the user from the `me` endpoint, a session from the rest.
const apiFetch = vi.fn(async (path: string, _options?: object) =>
  path.endsWith('/me') ? user : session,
)

// The auth module is already loaded by the test setup, with the real client.
// Each test therefore takes a fresh module graph with the client stubbed, the
// way `adapters.test.ts` does, which also gives it the shipped configuration.
let createAuthAdapter: typeof import('@/modules/auth').createAuthAdapter
let createAuthEndpoints: typeof import('@/modules/auth').createAuthEndpoints
let endpointPresets: typeof import('@/modules/auth').endpointPresets
let installAuthConfig: typeof import('@/modules/auth').installAuthConfig
let resolveAuthEndpoints: typeof import('@/modules/auth/adapters/endpoints').resolveAuthEndpoints
let AuthEndpointDisabledError: typeof import('@/modules/auth/adapters/endpoints').AuthEndpointDisabledError
let setPersistence: (mode: SessionPersistence) => void

beforeEach(async () => {
  vi.resetModules()
  apiFetch.mockClear()
  vi.doMock('~/lib/api/client', () => ({ apiFetch }))

  ;({ createAuthAdapter, createAuthEndpoints, endpointPresets, installAuthConfig } =
    await import('@/modules/auth'))
  ;({ resolveAuthEndpoints, AuthEndpointDisabledError } =
    await import('@/modules/auth/adapters/endpoints'))
  const { runtimeEnv } = await import('~/lib/config')
  setPersistence = (mode) => {
    runtimeEnv.sessionPersistence = mode
  }
  // Memory only, so `credentials` stays out of the options compared below.
  setPersistence('none')
})

afterEach(() => {
  vi.doUnmock('~/lib/api/client')
})

/** Every call the wire layer can make, in a fixed order. */
async function callEverything(endpoints: AuthEndpoints) {
  await endpoints.login({ email: 'a@b.test', password: 'pw' })
  await endpoints.register({ email: 'a@b.test', password: 'pw', name: 'A' })
  await endpoints.logout()
  await endpoints.getUser()
  await endpoints.getUserAs('fresh')
  await endpoints.refreshToken('held')
  await endpoints.refreshWithToken('held')
  await endpoints.resumeWithRefreshCookie()
  await endpoints.sendMagicLink({ email: 'a@b.test' })
  await endpoints.verifyMagicLink('magic')
  await endpoints.setupMfa()
  await endpoints.verifyMfa({ mfaToken: 'mfa', code: '000000' })
  await endpoints.disableMfa()
  await endpoints.exchangeCode({ code: 'c', code_verifier: 'v', redirect_uri: 'https://app/cb' })
}

/** `[path, options]` of each call, with the one function-valued option named. */
function calls() {
  return apiFetch.mock.calls.map(([path, options]) => {
    const { onRequest, ...rest } = options as { onRequest?: unknown }
    return [path, onRequest ? { ...rest, onRequest: 'withoutAccessToken' } : rest]
  })
}

describe('the vuestrata preset', () => {
  // Byte for byte what `adapters/base.ts` had as literals before it was a
  // table. A backend built to the documented contract depends on every line.
  it('is exactly the paths and methods the adapters always used', () => {
    expect(endpointPresets.vuestrata).toEqual({
      login: { path: '/auth/login', method: 'POST' },
      register: { path: '/auth/register', method: 'POST' },
      logout: { path: '/auth/logout', method: 'POST' },
      me: { path: '/auth/me' },
      refresh: { path: '/auth/refresh', method: 'POST' },
      magicLink: { path: '/auth/magic-link', method: 'POST' },
      magicLinkVerify: { path: '/auth/magic-link/verify', method: 'POST' },
      mfaSetup: { path: '/auth/mfa/setup', method: 'POST' },
      mfaVerify: { path: '/auth/mfa/verify', method: 'POST' },
      mfaDisable: { path: '/auth/mfa/disable', method: 'POST' },
      authorize: { path: '/auth/authorize' },
      providerAuthorize: { path: '/auth/:provider' },
      token: { path: '/auth/token', method: 'POST' },
    })
  })

  it('is the table in force when nothing is configured', () => {
    expect(resolveAuthEndpoints()).toEqual(endpointPresets.vuestrata)
    expect(createAuthEndpoints().spec).toEqual(endpointPresets.vuestrata)
    expect(resolveAuthEndpoints({ ...endpointPresets.vuestrata })).toEqual(
      endpointPresets.vuestrata,
    )
  })

  it('makes exactly the calls the old literals made', async () => {
    await callEverything(createAuthEndpoints())

    // The arguments `apiFetch` received before this was configurable, in
    // order. `me` carries no `method`: it never did.
    expect(calls()).toEqual([
      [
        '/auth/login',
        { skipAuthRefresh: true, method: 'POST', body: { email: 'a@b.test', password: 'pw' } },
      ],
      [
        '/auth/register',
        {
          skipAuthRefresh: true,
          method: 'POST',
          body: { email: 'a@b.test', password: 'pw', name: 'A' },
        },
      ],
      ['/auth/logout', { skipAuthRefresh: true, method: 'POST' }],
      ['/auth/me', { skipAuthRefresh: true }],
      ['/auth/me', { skipAuthRefresh: true, headers: { Authorization: 'Bearer fresh' } }],
      [
        '/auth/refresh',
        {
          skipAuthRefresh: true,
          method: 'POST',
          onRequest: 'withoutAccessToken',
          body: { refreshToken: 'held' },
        },
      ],
      [
        '/auth/refresh',
        {
          skipAuthRefresh: true,
          method: 'POST',
          onRequest: 'withoutAccessToken',
          body: { refreshToken: 'held' },
        },
      ],
      [
        '/auth/refresh',
        {
          skipAuthRefresh: true,
          method: 'POST',
          onRequest: 'withoutAccessToken',
          credentials: 'include',
        },
      ],
      ['/auth/magic-link', { skipAuthRefresh: true, method: 'POST', body: { email: 'a@b.test' } }],
      [
        '/auth/magic-link/verify',
        { skipAuthRefresh: true, method: 'POST', body: { token: 'magic' } },
      ],
      ['/auth/mfa/setup', { skipAuthRefresh: true, method: 'POST' }],
      [
        '/auth/mfa/verify',
        { skipAuthRefresh: true, method: 'POST', body: { mfaToken: 'mfa', code: '000000' } },
      ],
      ['/auth/mfa/disable', { skipAuthRefresh: true, method: 'POST' }],
      [
        '/auth/token',
        {
          skipAuthRefresh: true,
          method: 'POST',
          body: {
            grant_type: 'authorization_code',
            code: 'c',
            code_verifier: 'v',
            redirect_uri: 'https://app/cb',
          },
        },
      ],
    ])
  })
})

describe('overrides', () => {
  it('send each request where the project says, and leave the rest alone', async () => {
    const endpoints = createAuthEndpoints({
      login: '/api/v1/session',
      logout: { path: '/api/v1/session', method: 'DELETE' },
      me: '/users/me',
      refresh: '/api/v1/session/refresh',
    })

    await endpoints.login({ email: 'a@b.test', password: 'pw' })
    await endpoints.logout()
    await endpoints.getUser()
    await endpoints.refreshWithToken('held')
    await endpoints.sendMagicLink({ email: 'a@b.test' })

    expect(
      calls().map(([path, options]) => [path, (options as { method?: string }).method]),
    ).toEqual([
      // A path written as a string keeps the method the endpoint always had.
      ['/api/v1/session', 'POST'],
      ['/api/v1/session', 'DELETE'],
      // `me` has none, so it stays a GET.
      ['/users/me', undefined],
      ['/api/v1/session/refresh', 'POST'],
      ['/auth/magic-link', 'POST'],
    ])
  })

  it('accept a method on `me`, and an absolute URL for a backend elsewhere', () => {
    const spec = resolveAuthEndpoints({
      me: { path: '/whoami', method: 'POST' },
      token: 'https://id.example.test/oauth/token',
    })

    expect(spec.me).toEqual({ path: '/whoami', method: 'POST' })
    expect(spec.token).toEqual({ path: 'https://id.example.test/oauth/token', method: 'POST' })
  })

  it('keep every call marked as part of authentication, and the cookie policy', async () => {
    setPersistence('refresh-cookie')
    const endpoints = createAuthEndpoints({
      login: '/api/v1/session',
      me: '/users/me',
      refresh: '/api/v1/session/refresh',
      logout: '/api/v1/session/end',
    })

    await callEverything(endpoints)

    // Neither depends on the path: a 401 from a login is still its answer, and
    // the refresh cookie still has to be stored and sent, wherever these live.
    const options = apiFetch.mock.calls.map(([, entry]) => entry as Record<string, unknown>)
    expect(options).toHaveLength(14)
    expect(options.filter((entry) => entry.skipAuthRefresh !== true)).toEqual([])
    expect(options.filter((entry) => entry.credentials !== 'include')).toEqual([])
  })

  it.each([
    ['a name that is not an endpoint', { logn: '/x' }, /unknown endpoint\(s\) "logn"/],
    [
      'a path that is not rooted',
      { me: 'users/me' },
      /"me" endpoint must be a path starting with "\/"/,
    ],
    ['an empty path', { refresh: '' }, /"refresh" endpoint must be a path/],
    ['login switched off', { login: null }, /"login" endpoint cannot be switched off/],
    ['me switched off', { me: false }, /"me" endpoint cannot be switched off/],
  ])('refuse %s, naming auth.config.ts', (_case, overrides, message) => {
    expect(() => resolveAuthEndpoints(overrides as AuthEndpointOverrides)).toThrow(message)
    expect(() => installAuthConfig({ endpoints: overrides as AuthEndpointOverrides })).toThrow(
      /^auth\.config\.ts: /,
    )
  })
})

describe('an endpoint the project switched off', () => {
  it('rejects, with the endpoint named, if something calls it anyway', async () => {
    const endpoints = createAuthEndpoints({ magicLink: null, register: false })

    await expect(endpoints.sendMagicLink({ email: 'a@b.test' })).rejects.toBeInstanceOf(
      AuthEndpointDisabledError,
    )
    await expect(endpoints.register({ email: 'a', password: 'b', name: 'c' })).rejects.toThrow(
      /"register" auth endpoint is switched off in auth\.config\.ts/,
    )
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('makes logout a client-side matter when the backend has no logout endpoint', async () => {
    const endpoints = createAuthEndpoints({ logout: null })

    await expect(endpoints.logout()).resolves.toBeUndefined()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  // "The UI already hides controls by capability", so switching an endpoint
  // off has to reach the capability, and take the method with it.
  it.each([
    ['register', { register: null }, 'register', ['register']],
    ['magicLink', { magicLink: null }, 'magicLink', ['sendMagicLink', 'verifyMagicLink']],
    [
      'magicLinkVerify',
      { magicLinkVerify: false },
      'magicLink',
      ['sendMagicLink', 'verifyMagicLink'],
    ],
    ['mfaSetup', { mfaSetup: null }, 'mfa', ['setupMfa', 'verifyMfa', 'disableMfa']],
    ['mfaVerify', { mfaVerify: null }, 'mfa', ['setupMfa', 'verifyMfa', 'disableMfa']],
    ['mfaDisable', { mfaDisable: null }, 'mfa', ['setupMfa', 'verifyMfa', 'disableMfa']],
    ['refresh', { refresh: null }, 'refresh', ['refreshToken']],
  ] as const)(
    '%s takes the jwt adapter’s %s capability with it',
    (_name, endpoints, capability, methods) => {
      installAuthConfig({ endpoints })

      const adapter = createAuthAdapter('jwt')

      expect(adapter.capabilities[capability]).toBe(false)
      for (const method of methods) expect(adapter[method]).toBeUndefined()
      // Everything else it could do, it still can.
      const others = (['register', 'magicLink', 'mfa', 'refresh'] as const).filter(
        (name) => name !== capability,
      )
      for (const other of others) expect(adapter.capabilities[other]).toBe(true)
    },
  )

  it('leaves a jwt adapter with no refresh endpoint nothing to refresh or resume with', async () => {
    setPersistence('refresh-cookie')
    installAuthConfig({ endpoints: { refresh: null } })
    const adapter = createAuthAdapter('jwt', { getRefreshToken: () => 'held' })

    // Present, and answering "no": without them the API client would fall
    // back to its own refresh request, at a fixed path this backend lacks.
    expect(adapter.canRefreshSession!()).toBe(false)
    await expect(adapter.refreshSession!()).resolves.toBeNull()
    await expect(adapter.resumeSession!()).resolves.toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('takes the oauth adapter’s capabilities the same way', () => {
    installAuthConfig({ endpoints: { providerAuthorize: null, token: null } })

    const adapter = createAuthAdapter('oauth')

    expect(adapter.capabilities.social).toBe(false)
    expect(adapter.socialLogin).toBeUndefined()
    expect(adapter.capabilities.codeExchange).toBe(false)
    expect(adapter.exchangeCode).toBeUndefined()
  })

  it('stops an oauth sign-in that has nowhere to start', async () => {
    installAuthConfig({ endpoints: { authorize: null } })

    await expect(createAuthAdapter('oauth').login({ email: '', password: '' })).rejects.toThrow(
      /`authorize` endpoint, which is switched off/,
    )
  })
})

describe('capabilities a project disclaims', () => {
  it('are switched off for a backend that has the endpoint but not the feature', () => {
    installAuthConfig({ capabilities: { magicLink: false, mfa: false } })

    const adapter = createAuthAdapter('jwt')

    expect(adapter.capabilities).toMatchObject({ magicLink: false, mfa: false, register: true })
    expect(adapter.sendMagicLink).toBeUndefined()
    expect(adapter.setupMfa).toBeUndefined()
    expect(typeof adapter.register).toBe('function')
  })

  it('cannot be switched on: `true` adds nothing an adapter does not implement', () => {
    installAuthConfig({ capabilities: { social: true, codeExchange: true } })

    const adapter = createAuthAdapter('jwt')

    expect(adapter.capabilities.social).toBe(false)
    expect(adapter.socialLogin).toBeUndefined()
    expect(adapter.capabilities.codeExchange).toBe(false)
  })

  it('reach the oauth adapter too', () => {
    installAuthConfig({ capabilities: { social: false } })

    expect(createAuthAdapter('oauth').capabilities.social).toBe(false)
    expect(createAuthAdapter('oauth').socialLogin).toBeUndefined()
  })
})

describe('the mock adapter', () => {
  // Its backend is the demo's service worker, which serves the documented
  // contract whatever the project configured for its real one.
  it('keeps speaking the documented contract under a configured backend', async () => {
    installAuthConfig({
      endpoints: { login: '/api/v1/session', me: '/users/me', magicLink: null },
      capabilities: { mfa: false },
      mapAuthResponse: () => {
        throw new Error('the project’s mapper is for the project’s backend')
      },
    })
    const adapter = createAuthAdapter('mock')

    await expect(adapter.login({ email: 'a@b.test', password: 'pw' })).resolves.toMatchObject({
      token: 'access',
    })
    await adapter.getUser()

    expect(apiFetch.mock.calls.map(([path]) => path)).toEqual(['/auth/login', '/auth/me'])
    expect(adapter.capabilities).toMatchObject({ magicLink: true, mfa: true })
  })
})
