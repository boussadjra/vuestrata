import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import { restoreSessionForBoot, setupAuthInterceptor } from '@/bootstrap/auth-wiring'
import { apiFetch, installApiAuth } from '@/lib/api/client'
import { AppError } from '@/lib/errors'
import { createAuthAdapter } from '@/modules/auth'
import { useAuthStore } from '@/stores/auth'
import { readPersistedRefreshToken } from '~/lib/auth/session-persistence'
import { runtimeEnv, type SessionPersistence } from '~/lib/config'
import type { User } from '~/types'

import { resetRuntimeState } from '../../utils/reset-runtime-state'

/**
 * Sessions against a real backend, per `VUESTRATA_SESSION_PERSISTENCE`.
 *
 * Driven end to end: the real jwt adapter, the real API client, the real auth
 * store and the bootstrap's wiring, with msw as the backend. The production
 * default (`refresh-cookie`) shipped broken because nothing exercised it this
 * way: every `/auth/*` request went out with `credentials: 'omit'`, for which a
 * browser neither stores a `Set-Cookie` nor sends a cookie, so the refresh
 * cookie could not be set at login, presented on refresh or cleared on logout.
 *
 * Node has no cookie jar, so the backend below keeps one and applies the
 * browser's rule itself: a cookie is stored from, and sent with, only a request
 * whose `credentials` is `include`. Asserting `request.credentials` is
 * therefore asserting exactly what decides whether the cookie travels.
 */

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore().reset()
  setPersistence(DEFAULT_PERSISTENCE)
  sessionStorage.clear()
  localStorage.clear()
})
afterAll(() => server.close())

const DEFAULT_PERSISTENCE = runtimeEnv.sessionPersistence

/** `runtimeEnv` is resolved once at import; a test picks the mode by writing it. */
function setPersistence(mode: SessionPersistence) {
  runtimeEnv.sessionPersistence = mode
}

const user = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  role: 'manager',
} as User

interface SeenRequest {
  method: string
  path: string
  credentials: RequestCredentials
  authorization: string | null
  body: string
}

async function describeRequest(request: Request): Promise<SeenRequest> {
  return {
    method: request.method,
    path: new URL(request.url).pathname.replace(/^\/api/, ''),
    credentials: request.credentials,
    authorization: request.headers.get('Authorization'),
    body: await request.clone().text(),
  }
}

const unauthorized = () => HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })

/**
 * A backend built to the documented `refresh-cookie` contract.
 *
 * The refresh credential lives only in its cookie jar: no response body ever
 * carries a `refreshToken`, and `/auth/refresh` answers with tokens and no
 * `user`. Each login and each refresh rotates both the cookie and the access
 * token, and only the newest access token is accepted.
 */
function cookieBackend() {
  const state = {
    cookie: null as string | null,
    accessToken: null as string | null,
    serial: 0,
    seen: [] as SeenRequest[],
  }
  const withCredentials = (request: Request) => request.credentials === 'include'

  function issue(request: Request) {
    state.serial++
    state.accessToken = `access-${state.serial}`
    // The browser would drop this Set-Cookie for anything but `include`.
    if (withCredentials(request)) state.cookie = `refresh-cookie-${state.serial}`
    return { token: state.accessToken, expiresIn: 900 }
  }

  const authorized = (request: Request) =>
    state.accessToken !== null &&
    request.headers.get('Authorization') === `Bearer ${state.accessToken}`

  server.use(
    http.post('*/api/auth/login', async ({ request }) => {
      state.seen.push(await describeRequest(request))
      return HttpResponse.json({ user, ...issue(request) })
    }),
    http.post('*/api/auth/refresh', async ({ request }) => {
      state.seen.push(await describeRequest(request))
      const presented = withCredentials(request) ? state.cookie : null
      if (!presented) return unauthorized()
      return HttpResponse.json(issue(request))
    }),
    http.get('*/api/auth/me', async ({ request }) => {
      state.seen.push(await describeRequest(request))
      return authorized(request) ? HttpResponse.json(user) : unauthorized()
    }),
    http.post('*/api/auth/logout', async ({ request }) => {
      state.seen.push(await describeRequest(request))
      if (withCredentials(request)) state.cookie = null
      return new HttpResponse(null, { status: 204 })
    }),
    http.get('*/api/orders', async ({ request }) => {
      state.seen.push(await describeRequest(request))
      return authorized(request) ? HttpResponse.json({ ok: true }) : unauthorized()
    }),
  )

  return {
    state,
    requestsTo: (path: string) => state.seen.filter((request) => request.path === path),
    /** The access token ran out, as far as the backend is concerned. */
    expireAccessToken: () => {
      state.accessToken = null
    },
    /** The refresh credential was revoked server-side. */
    revokeCookie: () => {
      state.cookie = null
    },
  }
}

const protectedRoute = {
  fullPath: '/dashboard/orders?tab=open',
  path: '/dashboard/orders',
  meta: { requiresAuth: true },
}

/** What `boot()` does with the auth store, minus the application around it. */
function wire(adapterName = 'jwt') {
  const store = useAuthStore()
  const router = {
    replace: vi.fn().mockResolvedValue(undefined),
    currentRoute: { value: protectedRoute },
  }
  setupAuthInterceptor(store, {
    adapterName,
    createAuthAdapter,
    router: router as unknown as Parameters<typeof setupAuthInterceptor>[1]['router'],
  })
  return { store, router }
}

/** A page reload: everything in memory is gone, Web Storage and cookies stay. */
async function reload(adapterName = 'jwt') {
  useAuthStore().clearRefreshTimer()
  await resetRuntimeState()
  const wired = wire(adapterName)
  await restoreSessionForBoot(wired.store, { adapterName, createAuthAdapter })
  return wired
}

async function signIn(store: ReturnType<typeof useAuthStore>) {
  const result = await createAuthAdapter('jwt').login({ email: user.email, password: 'pw' })
  store.setAuth(result.user, result.token, result.refreshToken, result.expiresIn)
}

describe('refresh-cookie (the production default)', () => {
  it('stores the cookie at login and resumes from it after a reload', async () => {
    setPersistence('refresh-cookie')
    const backend = cookieBackend()
    const { store } = wire()

    await signIn(store)

    // The login request is the one that carries the Set-Cookie home.
    expect(backend.requestsTo('/auth/login')[0]?.credentials).toBe('include')
    expect(backend.state.cookie).toBe('refresh-cookie-1')
    // Nothing a script could read holds the refresh credential.
    expect(store.refreshToken).toBeNull()
    expect(sessionStorage.length + localStorage.length).toBe(0)

    const reloaded = await reload()

    const [refresh] = backend.requestsTo('/auth/refresh')
    expect(refresh).toMatchObject({ method: 'POST', credentials: 'include', body: '' })
    // The store is empty at boot, and a refresh presents its own credential.
    expect(refresh?.authorization).toBeNull()

    // `/auth/refresh` returned no user, so the app asked, as the holder of the
    // token it was just given — the store has none yet.
    const [me] = backend.requestsTo('/auth/me')
    expect(me).toMatchObject({ credentials: 'include', authorization: 'Bearer access-2' })

    expect(reloaded.store.isAuthenticated).toBe(true)
    expect(reloaded.store.user).toEqual(user)
    expect(reloaded.store.token).toBe('access-2')
    expect(reloaded.store.refreshToken).toBeNull()
  })

  it('refreshes mid-session with no refresh token in JavaScript, and replays the request', async () => {
    setPersistence('refresh-cookie')
    const backend = cookieBackend()
    const { store, router } = wire()
    await signIn(store)

    backend.expireAccessToken()
    await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })

    const orders = backend.requestsTo('/orders')
    expect(orders.map((request) => request.authorization)).toEqual([
      'Bearer access-1',
      'Bearer access-2',
    ])
    const refreshes = backend.requestsTo('/auth/refresh')
    expect(refreshes).toHaveLength(1)
    expect(refreshes[0]).toMatchObject({ credentials: 'include', body: '', authorization: null })
    expect(store.token).toBe('access-2')
    expect(store.user).toEqual(user)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('shares one refresh between requests that expire together', async () => {
    setPersistence('refresh-cookie')
    const backend = cookieBackend()
    const { store } = wire()
    await signIn(store)

    backend.expireAccessToken()
    const results = await Promise.all([apiFetch('/orders'), apiFetch('/orders')])

    expect(results).toEqual([{ ok: true }, { ok: true }])
    // A rotating backend would read a second presentation of the same cookie
    // as theft.
    expect(backend.requestsTo('/auth/refresh')).toHaveLength(1)
  })

  it('sends the cookie with logout, so the backend can clear it', async () => {
    setPersistence('refresh-cookie')
    const backend = cookieBackend()
    const { store } = wire()
    await signIn(store)

    await createAuthAdapter('jwt').logout()
    store.clearAuth('logout')

    expect(backend.requestsTo('/auth/logout')[0]?.credentials).toBe('include')
    expect(backend.state.cookie).toBeNull()

    // And the next boot finds nothing to resume.
    const reloaded = await reload()
    expect(reloaded.store.isAuthenticated).toBe(false)
  })

  it('ends the session once, with the destination and the reason, when the cookie was revoked', async () => {
    setPersistence('refresh-cookie')
    const backend = cookieBackend()
    const { store, router } = wire()
    await signIn(store)

    backend.expireAccessToken()
    backend.revokeCookie()
    const error = await apiFetch('/orders').then(
      () => undefined,
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).status).toBe(401)
    // The backend said no; asking again would only delay the sign-in page.
    expect(backend.requestsTo('/auth/refresh')).toHaveLength(1)
    expect(store.isAuthenticated).toBe(false)
    expect(router.replace).toHaveBeenCalledExactlyOnceWith({
      name: '/auth/login',
      query: { redirect: '/dashboard/orders?tab=open', reason: 'expired' },
    })
  })

  it('keeps the cookie off every request that is not an auth call', async () => {
    setPersistence('refresh-cookie')
    const backend = cookieBackend()
    const { store } = wire()
    await signIn(store)

    await apiFetch('/orders')
    backend.expireAccessToken()
    // A 401, the refresh, and the replay.
    await apiFetch('/orders')

    // "On /auth/* and nothing else": an API that answers `*` to its data
    // routes keeps working, and no cookie rides along where none is needed.
    expect(backend.requestsTo('/orders').map((request) => request.credentials)).toEqual([
      'omit',
      'omit',
      'omit',
    ])
    expect(backend.requestsTo('/auth/refresh').map((request) => request.credentials)).toEqual([
      'include',
    ])
  })

  it('does not call a sign-out an expiry when a request comes back 401 after it', async () => {
    setPersistence('refresh-cookie')
    const backend = cookieBackend()
    const { store, router } = wire()
    await signIn(store)

    await createAuthAdapter('jwt').logout()
    store.clearAuth('logout')
    // A request that was already on its way, or a component that had not
    // unmounted yet.
    await expect(apiFetch('/orders')).rejects.toMatchObject({ status: 401 })

    expect(backend.state.cookie).toBeNull()
    // The visitor signed out. The login page must not tell them they expired.
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('drops a refresh that answers after its user signed out and another signed in', async () => {
    setPersistence('refresh-cookie')
    const backend = cookieBackend()
    const { store, router } = wire()
    const grace = { ...user, id: 'u2', name: 'Grace Hopper', email: 'grace@example.test' } as User
    await signIn(store)

    // Ada's access token runs out, and the refresh for it is slow.
    backend.expireAccessToken()
    let asked = false
    let answer: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      answer = resolve
    })
    server.use(
      http.post(
        '*/api/auth/refresh',
        async () => {
          asked = true
          await held
          return HttpResponse.json({ token: 'access-for-ada', expiresIn: 900 })
        },
        { once: true },
      ),
    )
    const adasRequest = apiFetch('/orders').then(
      () => undefined,
      (reason: unknown) => reason,
    )
    await vi.waitFor(() => expect(asked).toBe(true))

    // She signs out, and Grace signs in on the same tab, before it answers.
    await createAuthAdapter('jwt').logout()
    store.clearAuth('logout')
    const login = await createAuthAdapter('jwt').login({ email: grace.email, password: 'pw' })
    store.setAuth(grace, login.token, login.refreshToken, login.expiresIn)
    answer()

    // Ada's request is abandoned, not answered and not reported as an expiry.
    expect(await adasRequest).toMatchObject({ kind: 'aborted' })
    expect(router.replace).not.toHaveBeenCalled()
    // Grace holds her own token, and it works.
    expect(store.user).toEqual(grace)
    expect(store.token).toBe(login.token)
    await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })
    store.clearRefreshTimer()
  })

  it('treats a reload with no cookie as signed out, without touching /auth/me', async () => {
    setPersistence('refresh-cookie')
    const backend = cookieBackend()

    const { store, router } = await reload()

    expect(store.isAuthenticated).toBe(false)
    expect(backend.requestsTo('/auth/me')).toHaveLength(0)
    // Booting signed out is the common case, not an expiry.
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('resumes no session when the refreshed token cannot load a user', async () => {
    setPersistence('refresh-cookie')
    const backend = cookieBackend()
    const { store } = wire()
    await signIn(store)
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({}, { status: 500 })))

    const reloaded = await reload()

    expect(backend.requestsTo('/auth/refresh')).toHaveLength(1)
    // A token with nobody attached is not a session.
    expect(reloaded.store.isAuthenticated).toBe(false)
    expect(reloaded.store.token).toBeNull()
    expect(reloaded.store.user).toBeNull()
  })

  it('uses the user a backend chose to return from /auth/refresh', async () => {
    setPersistence('refresh-cookie')
    const backend = cookieBackend()
    const { store } = wire()
    await signIn(store)
    server.use(
      http.post('*/api/auth/refresh', () =>
        HttpResponse.json({ user, token: 'access-with-user', expiresIn: 900 }),
      ),
    )

    const reloaded = await reload()

    expect(reloaded.store.user).toEqual(user)
    expect(reloaded.store.token).toBe('access-with-user')
    expect(backend.requestsTo('/auth/me')).toHaveLength(0)
  })
})

/**
 * A backend that hands the refresh token to JavaScript, as the `session`,
 * `local` and `none` modes expect. `/auth/refresh` still returns no `user`.
 */
function bodyTokenBackend() {
  const state = {
    refreshToken: null as string | null,
    accessToken: null as string | null,
    serial: 0,
    seen: [] as SeenRequest[],
  }

  function issue() {
    state.serial++
    state.accessToken = `access-${state.serial}`
    state.refreshToken = `refresh-${state.serial}`
    return { token: state.accessToken, refreshToken: state.refreshToken, expiresIn: 900 }
  }

  const authorized = (request: Request) =>
    state.accessToken !== null &&
    request.headers.get('Authorization') === `Bearer ${state.accessToken}`

  server.use(
    http.post('*/api/auth/login', async ({ request }) => {
      state.seen.push(await describeRequest(request))
      return HttpResponse.json({ user, ...issue() })
    }),
    http.post('*/api/auth/refresh', async ({ request }) => {
      state.seen.push(await describeRequest(request))
      const body = (await request.json().catch(() => null)) as { refreshToken?: string } | null
      if (!body?.refreshToken || body.refreshToken !== state.refreshToken) return unauthorized()
      return HttpResponse.json(issue())
    }),
    http.get('*/api/auth/me', async ({ request }) => {
      state.seen.push(await describeRequest(request))
      return authorized(request) ? HttpResponse.json(user) : unauthorized()
    }),
    http.get('*/api/orders', async ({ request }) => {
      state.seen.push(await describeRequest(request))
      return authorized(request) ? HttpResponse.json({ ok: true }) : unauthorized()
    }),
  )

  return {
    state,
    requestsTo: (path: string) => state.seen.filter((request) => request.path === path),
    expireAccessToken: () => {
      state.accessToken = null
    },
  }
}

describe('refresh-cookie against a backend that only knows the body contract', () => {
  // A project that left the default in place while its backend returns
  // `refreshToken` in the login body and sets no cookie. Mid-session refresh
  // worked for it before the cookie path existed, and must keep working.
  it('keeps refreshing mid-session with the token the backend handed over', async () => {
    setPersistence('refresh-cookie')
    const backend = bodyTokenBackend()
    const { store } = wire()
    await signIn(store)

    backend.expireAccessToken()
    await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })

    expect(backend.requestsTo('/auth/refresh')[0]).toMatchObject({
      credentials: 'include',
      body: JSON.stringify({ refreshToken: 'refresh-1' }),
    })
    expect(store.refreshToken).toBe('refresh-2')
    // Held in memory only: the mode never writes a credential to Web Storage.
    expect(sessionStorage.length + localStorage.length).toBe(0)
  })

  it('cannot resume after a reload, which only a cookie can do under this mode', async () => {
    setPersistence('refresh-cookie')
    const backend = bodyTokenBackend()
    const { store } = wire()
    await signIn(store)

    const reloaded = await reload()

    expect(backend.requestsTo('/auth/refresh')[0]).toMatchObject({
      credentials: 'include',
      body: '',
    })
    expect(reloaded.store.isAuthenticated).toBe(false)
  })
})

describe.each(['session', 'local'] as const)('%s storage', (mode) => {
  it('resumes from the persisted refresh token and loads the user from /auth/me', async () => {
    setPersistence(mode)
    const backend = bodyTokenBackend()
    const { store } = wire()
    await signIn(store)

    const reloaded = await reload()

    const [refresh] = backend.requestsTo('/auth/refresh')
    expect(refresh).toMatchObject({
      credentials: 'omit',
      body: JSON.stringify({ refreshToken: 'refresh-1' }),
    })
    expect(backend.requestsTo('/auth/me')[0]?.authorization).toBe('Bearer access-2')
    expect(reloaded.store.user).toEqual(user)
    expect(reloaded.store.token).toBe('access-2')
    // The rotation was written back, so the NEXT reload presents a live token.
    expect(reloaded.store.refreshToken).toBe('refresh-2')
  })

  it('keeps the rotated refresh token when the user cannot be loaded', async () => {
    setPersistence(mode)
    const backend = bodyTokenBackend()
    const { store } = wire()
    await signIn(store)
    expect(readPersistedRefreshToken()).toBe('refresh-1')
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({}, { status: 500 }), { once: true }),
    )

    const failed = await reload()

    // The refresh went through and spent `refresh-1`; the resume did not.
    expect(backend.requestsTo('/auth/refresh')).toHaveLength(1)
    expect(failed.store.isAuthenticated).toBe(false)
    // What is stored is the token the backend now expects. Left as it was, the
    // next boot would present a spent token to a backend that reads a replay
    // as theft.
    expect(readPersistedRefreshToken()).toBe('refresh-2')

    const retried = await reload()

    expect(backend.requestsTo('/auth/refresh')[1]?.body).toBe(
      JSON.stringify({ refreshToken: 'refresh-2' }),
    )
    expect(retried.store.user).toEqual(user)
    expect(retried.store.token).toBe('access-3')
  })

  it('refreshes mid-session with the held token and replays the request', async () => {
    setPersistence(mode)
    const backend = bodyTokenBackend()
    const { store } = wire()
    await signIn(store)

    backend.expireAccessToken()
    await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })

    const refreshes = backend.requestsTo('/auth/refresh')
    expect(refreshes).toHaveLength(1)
    expect(refreshes[0]).toMatchObject({
      credentials: 'omit',
      body: JSON.stringify({ refreshToken: 'refresh-1' }),
      authorization: null,
    })
    expect(store.token).toBe('access-2')
    expect(store.refreshToken).toBe('refresh-2')
  })
})

describe('none (memory only)', () => {
  it('refreshes mid-session from memory, and ends at a reload by design', async () => {
    setPersistence('none')
    const backend = bodyTokenBackend()
    const { store } = wire()
    await signIn(store)

    backend.expireAccessToken()
    await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })
    expect(backend.requestsTo('/auth/refresh')[0]).toMatchObject({
      credentials: 'omit',
      body: JSON.stringify({ refreshToken: 'refresh-1' }),
    })
    expect(sessionStorage.length + localStorage.length).toBe(0)

    const reloaded = await reload()

    expect(reloaded.store.isAuthenticated).toBe(false)
    // Nothing to present, so nothing was asked.
    expect(backend.requestsTo('/auth/refresh')).toHaveLength(1)
  })
})

describe('credentials on every auth call', () => {
  /** Answers anything under `/auth/`, recording how it was asked. */
  function recordingBackend() {
    const seen: SeenRequest[] = []
    server.use(
      http.all('*/api/auth/*', async ({ request }) => {
        seen.push(await describeRequest(request))
        return HttpResponse.json({ user, token: 'access', refreshToken: 'refresh', expiresIn: 900 })
      }),
    )
    return seen
  }

  /** Every request the jwt adapter can make, by the path it goes to. */
  async function callEverything() {
    const adapter = createAuthAdapter('jwt', {
      getToken: () => null,
      getRefreshToken: () => 'held-refresh',
    })
    await adapter.login({ email: user.email, password: 'pw' })
    await adapter.register!({ email: user.email, password: 'pw', name: user.name })
    await adapter.getUser()
    await adapter.sendMagicLink!({ email: user.email })
    await adapter.verifyMagicLink!('magic')
    await adapter.setupMfa!()
    await adapter.verifyMfa!({ mfaToken: 'mfa', code: '000000' })
    await adapter.disableMfa!()
    await adapter.refreshToken!('held-refresh')
    await adapter.refreshSession!()
    await adapter.logout()
  }

  const EVERY_PATH = [
    '/auth/login',
    '/auth/register',
    '/auth/me',
    '/auth/magic-link',
    '/auth/magic-link/verify',
    '/auth/mfa/setup',
    '/auth/mfa/verify',
    '/auth/mfa/disable',
    '/auth/refresh',
    '/auth/logout',
  ]

  it.each([
    ['refresh-cookie', 'include'],
    ['none', 'omit'],
    ['session', 'omit'],
    ['local', 'omit'],
  ] as const)('%s sends %s on all of them', async (mode, credentials) => {
    setPersistence(mode)
    const seen = recordingBackend()
    wire()

    await callEverything()

    expect([...new Set(seen.map((request) => request.path))].sort()).toEqual([...EVERY_PATH].sort())
    expect(seen.filter((request) => request.credentials !== credentials)).toEqual([])
  })

  it('sends the cookie on a boot-time resume too', async () => {
    setPersistence('refresh-cookie')
    const seen = recordingBackend()
    wire()

    await createAuthAdapter('jwt').resumeSession!()

    expect(seen.map((request) => [request.path, request.credentials])).toEqual([
      ['/auth/refresh', 'include'],
    ])
  })

  it('includes credentials for a cookie-transport adapter whatever the persistence mode', async () => {
    setPersistence('none')
    const seen = recordingBackend()
    const { store } = wire('oauth')
    const adapter = createAuthAdapter('oauth')

    await adapter.getUser()
    await adapter.logout()

    expect(seen.map((request) => [request.path, request.credentials])).toEqual([
      ['/auth/me', 'include'],
      ['/auth/logout', 'include'],
    ])
    // The session is the cookie: no bearer token is ever attached.
    expect(seen.every((request) => request.authorization === null)).toBe(true)
    expect(store.token).toBeNull()
  })
})

describe('code written before the adapter-driven refresh', () => {
  it('still refreshes through an adapter with no refreshSession (the demo adapter)', async () => {
    setPersistence('none')
    const backend = bodyTokenBackend()
    const { store } = wire('mock')
    expect(createAuthAdapter('mock').refreshSession).toBeUndefined()
    const result = await createAuthAdapter('mock').login({ email: user.email, password: 'pw' })
    store.setAuth(result.user, result.token, result.refreshToken, result.expiresIn)

    backend.expireAccessToken()
    await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })

    // The interceptor's own request: the body token it always sent.
    expect(backend.requestsTo('/auth/refresh')[0]).toMatchObject({
      credentials: 'omit',
      body: JSON.stringify({ refreshToken: 'refresh-1' }),
    })
    expect(store.token).toBe('access-2')
    expect(store.refreshToken).toBe('refresh-2')
  })

  it('still refreshes for a provider with neither refresh nor canRefresh', async () => {
    const backend = bodyTokenBackend()
    backend.state.refreshToken = 'refresh-0'
    const session = { token: 'stale' as string | null, refreshToken: 'refresh-0' as string | null }
    // The 1.0 provider shape, as a project that wires its own would have it.
    installApiAuth({
      getToken: () => session.token,
      getRefreshToken: () => session.refreshToken,
      setAuth: (token: string, refreshToken: string) => {
        session.token = token
        session.refreshToken = refreshToken
      },
      clearAuth: () => {
        session.token = null
        session.refreshToken = null
      },
    })

    await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })

    expect(session).toEqual({ token: 'access-1', refreshToken: 'refresh-1' })
    expect(backend.requestsTo('/auth/refresh')[0]?.body).toBe(
      JSON.stringify({ refreshToken: 'refresh-0' }),
    )
  })

  it('gives up without a request when such a provider holds no refresh token', async () => {
    const backend = bodyTokenBackend()
    const onSessionExpired = vi.fn()
    installApiAuth({
      getToken: () => 'stale',
      getRefreshToken: () => null,
      setAuth: vi.fn(),
      clearAuth: vi.fn(),
      onSessionExpired,
    })

    await expect(apiFetch('/orders')).rejects.toMatchObject({ status: 401 })

    expect(backend.requestsTo('/auth/refresh')).toHaveLength(0)
    expect(onSessionExpired).toHaveBeenCalledOnce()
  })
})
