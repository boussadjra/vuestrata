import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import { restoreSessionForBoot, setupAuthInterceptor } from '@/bootstrap/auth-wiring'
import { apiFetch } from '@/lib/api/client'
import { AppError } from '@/lib/errors'
import {
  authRefreshBodies,
  authResponseMappers,
  createAuthAdapter,
  defineAuthConfig,
  installAuthConfig,
} from '@/modules/auth'
import { useAuthStore } from '@/stores/auth'
import { readPersistedRefreshToken } from '~/lib/auth/session-persistence'
import { runtimeEnv, type SessionPersistence } from '~/lib/config'

import { resetRuntimeState } from '../../utils/reset-runtime-state'

/**
 * A backend that was not written for this template, integrated from
 * `auth.config.ts` alone.
 *
 * It keeps sessions at `/v1/session`, the current user at `/users/me`, names
 * its tokens in snake_case, answers a login with tokens and no user, and
 * shapes the user its own way. None of that could be said without editing
 * `adapters/base.ts`, and the refresh in particular had a second copy of the
 * shape inside the API client: `{ refreshToken }` in, `res.token` out. A
 * backend like this one signed in and was then signed out by its first 401.
 *
 * Driven end to end: the real jwt adapter, the real API client, the real auth
 * store and the bootstrap's wiring, with msw as the backend. The server has NO
 * handler under `/auth/`, and an unhandled request is an error — so a request
 * to any of the built-in paths, from any layer, fails the test that made it.
 */

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore().reset()
  installAuthConfig({})
  runtimeEnv.sessionPersistence = DEFAULT_PERSISTENCE
  sessionStorage.clear()
  localStorage.clear()
})
afterAll(() => server.close())

const DEFAULT_PERSISTENCE = runtimeEnv.sessionPersistence

/** The user as this backend sends it. */
const backendUser = {
  id: 7,
  email: 'ada@example.test',
  full_name: 'Ada Lovelace',
  role_name: 'manager',
  avatar_url: null,
}

/** The user as the app holds it. */
const appUser = { id: '7', email: 'ada@example.test', name: 'Ada Lovelace', role: 'manager' }

/** What the project writes in `app/config/auth.config.ts`. Nothing else is touched. */
const authConfig = defineAuthConfig({
  endpoints: {
    login: '/v1/session',
    logout: { path: '/v1/session', method: 'DELETE' },
    refresh: '/v1/session/refresh',
    me: '/users/me',
    // This backend has no self-service sign-up, magic links or MFA.
    register: null,
    magicLink: null,
    magicLinkVerify: null,
    mfaSetup: null,
    mfaVerify: null,
    mfaDisable: null,
  },
  mapAuthResponse: authResponseMappers.snakeCase,
  buildRefreshBody: authRefreshBodies.snakeCase,
  mapUser: (raw) => {
    const user = raw as typeof backendUser
    return { id: user.id, email: user.email, name: user.full_name, role: user.role_name }
  },
})

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
 * The backend. `mode` is where it keeps the refresh credential: in the body it
 * hands to JavaScript, or in a cookie only it can read (Node has no cookie
 * jar, so it keeps one, and applies the browser's rule that a cookie is stored
 * from and sent with a `credentials: 'include'` request only).
 */
function snakeCaseBackend(mode: 'body' | 'cookie' = 'body') {
  const state = {
    accessToken: null as string | null,
    refreshToken: null as string | null,
    serial: 0,
    seen: [] as SeenRequest[],
    me: backendUser as Record<string, unknown>,
  }
  const withCredentials = (request: Request) => request.credentials === 'include'

  function issue(request: Request) {
    state.serial++
    state.accessToken = `access-${state.serial}`
    if (mode === 'body' || withCredentials(request)) state.refreshToken = `refresh-${state.serial}`
    return {
      access_token: state.accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      ...(mode === 'body' ? { refresh_token: state.refreshToken } : {}),
    }
  }

  const authorized = (request: Request) =>
    state.accessToken !== null &&
    request.headers.get('Authorization') === `Bearer ${state.accessToken}`

  server.use(
    http.post('*/api/v1/session', async ({ request }) => {
      state.seen.push(await describeRequest(request))
      return HttpResponse.json(issue(request))
    }),
    http.post('*/api/v1/session/refresh', async ({ request }) => {
      state.seen.push(await describeRequest(request))
      const body = (await request.json().catch(() => null)) as { refresh_token?: string } | null
      const presented =
        mode === 'body' ? body?.refresh_token : withCredentials(request) ? state.refreshToken : null
      if (!presented || presented !== state.refreshToken) return unauthorized()
      return HttpResponse.json(issue(request))
    }),
    http.delete('*/api/v1/session', async ({ request }) => {
      state.seen.push(await describeRequest(request))
      state.accessToken = null
      state.refreshToken = null
      return new HttpResponse(null, { status: 204 })
    }),
    http.get('*/api/users/me', async ({ request }) => {
      state.seen.push(await describeRequest(request))
      return authorized(request) ? HttpResponse.json(state.me) : unauthorized()
    }),
    http.get('*/api/orders', async ({ request }) => {
      state.seen.push(await describeRequest(request))
      return authorized(request) ? HttpResponse.json({ ok: true }) : unauthorized()
    }),
  )

  return {
    state,
    requestsTo: (path: string) => state.seen.filter((request) => request.path === path),
    log: () => state.seen.map((request) => `${request.method} ${request.path}`),
    /** The access token ran out, as far as the backend is concerned. */
    expireAccessToken: () => {
      state.accessToken = null
    },
  }
}

const protectedRoute = {
  fullPath: '/dashboard/orders',
  path: '/dashboard/orders',
  meta: { requiresAuth: true },
}

/** What `boot()` does: install the seam, then wire auth. */
function wire(mode: SessionPersistence) {
  runtimeEnv.sessionPersistence = mode
  installAuthConfig(authConfig)
  const store = useAuthStore()
  const router = {
    replace: vi.fn().mockResolvedValue(undefined),
    currentRoute: { value: protectedRoute },
  }
  setupAuthInterceptor(store, {
    adapterName: 'jwt',
    createAuthAdapter,
    router: router as unknown as Parameters<typeof setupAuthInterceptor>[1]['router'],
  })
  return { store, router }
}

/** A page reload: everything in memory is gone, Web Storage and cookies stay. */
async function reload(mode: SessionPersistence) {
  useAuthStore().clearRefreshTimer()
  await resetRuntimeState()
  const wired = wire(mode)
  await restoreSessionForBoot(wired.store, { adapterName: 'jwt', createAuthAdapter })
  return wired
}

/** What `useAuth().login()` does with the adapter's answer. */
async function signIn(store: ReturnType<typeof useAuthStore>) {
  const result = await createAuthAdapter('jwt').login({ email: appUser.email, password: 'pw' })
  store.setAuth(result.user, result.token, result.refreshToken, result.expiresIn)
  return result
}

describe('a snake_case backend with its own paths', () => {
  it('signs in: tokens from the session endpoint, the user from /users/me', async () => {
    const backend = snakeCaseBackend()
    const { store } = wire('session')

    const result = await signIn(store)

    expect(backend.log()).toEqual(['POST /v1/session', 'GET /users/me'])
    expect(backend.requestsTo('/v1/session')[0]?.body).toBe(
      JSON.stringify({ email: appUser.email, password: 'pw' }),
    )
    // The login answered with tokens alone, so the app asked who that is, as
    // the holder of the token it had just been given.
    expect(backend.requestsTo('/users/me')[0]?.authorization).toBe('Bearer access-1')

    expect(result).toEqual({
      user: appUser,
      token: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 900,
    })
    expect(store.isAuthenticated).toBe(true)
    expect(store.user).toEqual(appUser)
    expect(readPersistedRefreshToken()).toBe('refresh-1')
  })

  it('goes through login, a 401, the refresh, the replay and a reload', async () => {
    const backend = snakeCaseBackend()
    const { store, router } = wire('session')
    await signIn(store)

    // ── The access token runs out mid-session ──────────────────────────────
    backend.expireAccessToken()
    await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })

    expect(backend.log()).toEqual([
      'POST /v1/session',
      'GET /users/me',
      'GET /orders',
      'POST /v1/session/refresh',
      'GET /orders',
    ])
    const [refresh] = backend.requestsTo('/v1/session/refresh')
    // The backend's own body shape, and no expired access token beside it.
    expect(refresh).toMatchObject({
      body: JSON.stringify({ refresh_token: 'refresh-1' }),
      authorization: null,
    })
    expect(backend.requestsTo('/orders').map((request) => request.authorization)).toEqual([
      'Bearer access-1',
      'Bearer access-2',
    ])
    // The backend's own response shape, read into the store.
    expect(store.token).toBe('access-2')
    expect(store.refreshToken).toBe('refresh-2')
    expect(store.user).toEqual(appUser)
    expect(readPersistedRefreshToken()).toBe('refresh-2')
    expect(router.replace).not.toHaveBeenCalled()

    // ── The page reloads ───────────────────────────────────────────────────
    const reloaded = await reload('session')

    expect(backend.log().slice(5)).toEqual(['POST /v1/session/refresh', 'GET /users/me'])
    expect(backend.requestsTo('/v1/session/refresh')[1]?.body).toBe(
      JSON.stringify({ refresh_token: 'refresh-2' }),
    )
    expect(backend.requestsTo('/users/me')[1]?.authorization).toBe('Bearer access-3')
    expect(reloaded.store.isAuthenticated).toBe(true)
    expect(reloaded.store.user).toEqual(appUser)
    expect(reloaded.store.token).toBe('access-3')
    expect(reloaded.store.refreshToken).toBe('refresh-3')

    // And the resumed session works.
    await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })
    reloaded.store.clearRefreshTimer()
  })

  it('shares one refresh between requests that expire together', async () => {
    const backend = snakeCaseBackend()
    const { store } = wire('none')
    await signIn(store)

    backend.expireAccessToken()
    const results = await Promise.all([apiFetch('/orders'), apiFetch('/orders')])

    expect(results).toEqual([{ ok: true }, { ok: true }])
    expect(backend.requestsTo('/v1/session/refresh')).toHaveLength(1)
  })

  it('does the same from a refresh cookie, with nothing in the body', async () => {
    const backend = snakeCaseBackend('cookie')
    const { store } = wire('refresh-cookie')
    await signIn(store)

    // The cookie is the credential: JavaScript was handed no refresh token.
    expect(store.refreshToken).toBeNull()
    expect(backend.requestsTo('/v1/session')[0]?.credentials).toBe('include')

    backend.expireAccessToken()
    await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })

    expect(backend.requestsTo('/v1/session/refresh')[0]).toMatchObject({
      credentials: 'include',
      body: '',
      authorization: null,
    })
    expect(store.token).toBe('access-2')

    const reloaded = await reload('refresh-cookie')

    expect(backend.requestsTo('/v1/session/refresh')[1]).toMatchObject({
      credentials: 'include',
      body: '',
    })
    expect(reloaded.store.user).toEqual(appUser)
    expect(reloaded.store.token).toBe('access-3')
    expect(sessionStorage.length + localStorage.length).toBe(0)
    reloaded.store.clearRefreshTimer()
  })

  it('ends the session, with the way back, when the refresh is refused', async () => {
    const backend = snakeCaseBackend()
    const { store, router } = wire('none')
    await signIn(store)

    backend.expireAccessToken()
    backend.state.refreshToken = null
    const error = await apiFetch('/orders').then(
      () => undefined,
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).status).toBe(401)
    expect(backend.requestsTo('/v1/session/refresh')).toHaveLength(1)
    expect(store.isAuthenticated).toBe(false)
    expect(router.replace).toHaveBeenCalledExactlyOnceWith({
      name: '/auth/login',
      query: { redirect: '/dashboard/orders', reason: 'expired' },
    })
  })

  it('signs out at the backend’s own endpoint, with its own method', async () => {
    const backend = snakeCaseBackend()
    const { store } = wire('none')
    await signIn(store)

    await createAuthAdapter('jwt', { getToken: () => store.token }).logout()
    store.clearAuth('logout')

    expect(backend.log().at(-1)).toBe('DELETE /v1/session')
    expect(backend.state.refreshToken).toBeNull()
  })

  it('offers only what this backend has', () => {
    wire('none')
    const adapter = createAuthAdapter('jwt')

    expect(adapter.capabilities).toEqual({
      register: false,
      social: false,
      magicLink: false,
      mfa: false,
      refresh: true,
      codeExchange: false,
    })
    expect(adapter.register).toBeUndefined()
    expect(adapter.sendMagicLink).toBeUndefined()
    expect(adapter.setupMfa).toBeUndefined()
  })

  it('fails the sign-in loudly when the user payload has drifted', async () => {
    const backend = snakeCaseBackend()
    // A release of the backend renamed the field the mapper reads.
    backend.state.me = {
      id: 7,
      email: 'ada@example.test',
      display_name: 'Ada',
      role_name: 'manager',
    }
    const { store } = wire('none')

    const error = await signIn(store).then(
      () => undefined,
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({ code: 'CONTRACT_MISMATCH', kind: 'contract' })
    expect((error as AppError).details).toHaveProperty('name')
    // Nobody is half signed in.
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.token).toBeNull()
  })

  it('does not resume a session whose user payload has drifted', async () => {
    const backend = snakeCaseBackend()
    const { store } = wire('session')
    await signIn(store)
    backend.state.me = { id: 7 }

    const reloaded = await reload('session')

    expect(reloaded.store.isAuthenticated).toBe(false)
    expect(reloaded.store.user).toBeNull()
  })
})
