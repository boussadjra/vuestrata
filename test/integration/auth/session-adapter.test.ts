import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test'

import { restoreSessionForBoot, setupAuthInterceptor } from '@/bootstrap/auth-wiring'
import { apiFetch } from '@/lib/api/client'
import { csrfPresets } from '@/lib/api/csrf'
import { resolveApiIntegration, type ApiOverrides } from '@/lib/api/integration'
import { presets } from '@/lib/api/presets'
import { endpointPresets, installAuthConfig, resolveAuthConfig, type AuthConfig } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { installApiIntegration } from '@/lib/runtime'
import { createAuthAdapter } from '@/modules/auth'
import { useAuthStore } from '@/stores/auth'
import { runtimeEnv } from '~/lib/config'
import type { User } from '~/types'

import { captureLogged } from '../../utils/logged'

/**
 * The `session` adapter against a backend that keeps a server session: the
 * real adapter, the real API client, the real auth store and the bootstrap's
 * wiring, with msw as the backend.
 *
 * Node has no cookie jar, so the backend below keeps the session itself and
 * applies the browser's rule: a cookie is stored from, and sent with, only a
 * request whose `credentials` is `include`. The CSRF cookie is the one cookie
 * JavaScript reads, so the backend writes it to `document.cookie`, which is
 * where the client's strategy looks. What a real browser does with real
 * cookies is `e2e/integration/session.spec.ts`.
 */

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  // The adapter is compiled in when a build selects it; this is that build.
  vi.stubGlobal('__VUESTRATA_SESSION_ADAPTER__', true)
  runtimeEnv.sessionPersistence = 'none'
})
afterEach(() => {
  server.resetHandlers()
  useAuthStore().reset()
  runtimeEnv.sessionPersistence = DEFAULT_PERSISTENCE
  configure()
  sessionStorage.clear()
  localStorage.clear()
  clearCookies()
  document.head.querySelectorAll('meta[name="csrf-token"]').forEach((tag) => tag.remove())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
afterAll(() => server.close())

const DEFAULT_PERSISTENCE = runtimeEnv.sessionPersistence

/** Put both seams in force, as `installSeams()` does with the project's files. */
function configure(auth: AuthConfig = {}, api: ApiOverrides = {}) {
  installAuthConfig(resolveAuthConfig(auth))
  installApiIntegration(resolveApiIntegration(api))
}

function clearCookies() {
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
}

/** The user as Laravel serializes it. */
const laravelUser = {
  id: 7,
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  email_verified_at: '2026-01-05T10:00:00.000000Z',
  role: 'manager',
}

/** The same user as the app holds it. */
const user = { id: '7', name: 'Ada Lovelace', email: 'ada@example.test', role: 'manager' } as User

const mapUser: AuthConfig['mapUser'] = (raw) => {
  const record = raw as typeof laravelUser
  return { id: String(record.id), name: record.name, email: record.email, role: record.role }
}

/** The two lines a Laravel project writes. */
const SANCTUM: [AuthConfig, ApiOverrides] = [
  { endpoints: endpointPresets.sanctum, mapUser },
  { backend: presets.laravel },
]

const PAGE = window.location.origin

/** One request, as a single comparable line. The origin is shown when it is not the page's. */
async function line(request: Request): Promise<string> {
  const url = new URL(request.url)
  const body = await request.clone().text()
  return [
    request.method,
    `${url.origin === PAGE ? '' : url.origin}${url.pathname}${url.search}`,
    `credentials=${request.credentials}`,
    `authorization=${request.headers.get('Authorization') ?? '-'}`,
    `xsrf=${request.headers.get('X-XSRF-TOKEN') ?? '-'}`,
    `body=${body || '-'}`,
  ].join(' ')
}

const unauthenticated = () => HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })
const tokenMismatch = () => HttpResponse.json({ message: 'CSRF token mismatch.' }, { status: 419 })
const noContent = () => new HttpResponse(null, { status: 204 })

/**
 * A backend shaped like Laravel with Sanctum's SPA authentication, on `origin`.
 *
 * The session routes are at the root of the origin and the API under `/api`.
 * The CSRF token is tied to the session and replaced whenever the session is:
 * on login and on logout, as Laravel does against session fixation. It has a
 * `=` in it, like the real one, so a client that forgets to decode the cookie
 * sends a value the backend refuses.
 */
function sanctumBackend(origin = '*') {
  const state = {
    /** Whoever the session cookie belongs to, or null. */
    session: null as typeof laravelUser | null,
    /** The token the backend expects, or null before any was issued. */
    token: null as string | null,
    serial: 0,
    seen: [] as string[],
  }
  const withCookies = (request: Request) => request.credentials === 'include'

  /** Issue a token: the `XSRF-TOKEN` cookie, percent-encoded, readable by the page. */
  function issueToken(request: Request) {
    state.serial++
    state.token = `xsrf-${state.serial}=`
    // A browser would drop this Set-Cookie for anything but `include`.
    if (withCookies(request)) {
      document.cookie = `XSRF-TOKEN=${encodeURIComponent(state.token)}; path=/`
    }
  }

  const verified = (request: Request) =>
    withCookies(request) &&
    state.token !== null &&
    request.headers.get('X-XSRF-TOKEN') === state.token

  server.use(
    http.get(`${origin}/sanctum/csrf-cookie`, async ({ request }) => {
      state.seen.push(await line(request))
      issueToken(request)
      return noContent()
    }),
    http.post(`${origin}/login`, async ({ request }) => {
      state.seen.push(await line(request))
      if (!verified(request)) return tokenMismatch()
      const credentials = (await request.json()) as { email?: string; password?: string }
      if (credentials.password !== 'correct') {
        return HttpResponse.json(
          {
            message: 'These credentials do not match our records.',
            errors: { email: ['These credentials do not match our records.'] },
          },
          { status: 422 },
        )
      }
      state.session = laravelUser
      issueToken(request)
      return noContent()
    }),
    http.post(`${origin}/logout`, async ({ request }) => {
      state.seen.push(await line(request))
      if (!verified(request)) return tokenMismatch()
      state.session = null
      issueToken(request)
      return noContent()
    }),
    http.get(`${origin}/api/user`, async ({ request }) => {
      state.seen.push(await line(request))
      return withCookies(request) && state.session
        ? HttpResponse.json(state.session)
        : unauthenticated()
    }),
    http.get(`${origin}/api/things`, async ({ request }) => {
      state.seen.push(await line(request))
      return withCookies(request) && state.session ? HttpResponse.json([]) : unauthenticated()
    }),
    http.post(`${origin}/api/things`, async ({ request }) => {
      state.seen.push(await line(request))
      if (!withCookies(request) || !state.session) return unauthenticated()
      if (!verified(request)) return tokenMismatch()
      return HttpResponse.json({ id: 1 }, { status: 201 })
    }),
  )
  return state
}

const PROTECTED_ROUTE = {
  fullPath: '/dashboard/customers?page=2',
  path: '/dashboard/customers',
  meta: { requiresAuth: true },
}

function wire() {
  const store = useAuthStore()
  const router = { replace: vi.fn(async () => {}), currentRoute: { value: PROTECTED_ROUTE } }
  setupAuthInterceptor(store, {
    adapterName: 'session',
    createAuthAdapter,
    router: router as unknown as Parameters<typeof setupAuthInterceptor>[1]['router'],
  })
  return { store, router, adapter: createAuthAdapter('session') }
}

/** Sign in the way `useAuth().login` does: whatever the adapter answers goes to the store. */
async function signIn({ store, adapter }: ReturnType<typeof wire>, password = 'correct') {
  const session = await adapter.login({ email: laravelUser.email, password })
  store.setAuth(session.user, session.token, session.refreshToken, session.expiresIn)
  return session
}

const CREDENTIALS = '{"email":"ada@example.test","password":"correct"}'

describe('with the Sanctum presets, on the page’s own origin', () => {
  it('signs in: the CSRF cookie first, then the credentials with the token, then the user', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    const app = wire()

    const session = await signIn(app)

    expect(backend.seen).toEqual([
      'GET /sanctum/csrf-cookie credentials=include authorization=- xsrf=- body=-',
      `POST /login credentials=include authorization=- xsrf=xsrf-1= body=${CREDENTIALS}`,
      'GET /api/user credentials=include authorization=- xsrf=xsrf-2= body=-',
    ])
    // A 204 is the answer, and it carries nothing: the user came from `me`,
    // through `mapUser`, and no token was invented.
    expect(session).toEqual({ user })
    expect(app.store.user).toEqual(user)
    expect(app.store.isAuthenticated).toBe(true)
    expect(app.store.token).toBeFalsy()
    expect(app.store.refreshToken).toBeNull()
  })

  it('asks for a fresh CSRF token even when the page already holds one', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    // Left by an earlier visit, for a session the backend no longer has.
    document.cookie = 'XSRF-TOKEN=left-over; path=/'
    const app = wire()

    await signIn(app)

    expect(backend.seen.map((entry) => entry.split(' credentials')[0])).toEqual([
      'GET /sanctum/csrf-cookie',
      'POST /login',
      'GET /api/user',
    ])
    expect(backend.seen[1]).toContain('xsrf=xsrf-1=')
  })

  it('sends the token the backend issued with the new session on the next write', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    const app = wire()
    await signIn(app)
    backend.seen.length = 0

    await apiFetch('/things', { method: 'POST', body: { a: 1 } })

    expect(backend.seen).toEqual([
      'POST /api/things credentials=include authorization=- xsrf=xsrf-2= body={"a":1}',
    ])
  })

  it('resumes after a reload by asking who the cookie belongs to', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    backend.session = laravelUser
    const { store, router } = wire()

    await restoreSessionForBoot(store, { adapterName: 'session', createAuthAdapter })

    expect(backend.seen).toEqual([
      'GET /api/user credentials=include authorization=- xsrf=- body=-',
    ])
    expect(store.user).toEqual(user)
    expect(store.isAuthenticated).toBe(true)
    expect(store.token).toBeNull()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('signs out with the token, and forgets the session whatever the backend answers', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    const app = wire()
    await signIn(app)
    backend.seen.length = 0

    await app.adapter.logout()

    expect(backend.seen).toEqual([
      'POST /logout credentials=include authorization=- xsrf=xsrf-2= body=-',
    ])
    expect(backend.session).toBeNull()

    // And when the backend is down: the caller clears its own state all the same.
    server.use(http.post('*/logout', () => HttpResponse.error()))
    const logged = captureLogged()
    await expect(app.adapter.logout()).resolves.toBeUndefined()
    logged.restore()
  })

  it('keeps Laravel’s message and field errors for wrong credentials', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    const app = wire()

    const refused = await signIn(app, 'wrong').catch((error: unknown) => error)

    expect(refused).toBeInstanceOf(AppError)
    expect(refused).toMatchObject({
      status: 422,
      message: 'These credentials do not match our records.',
      details: { email: ['These credentials do not match our records.'] },
    })
    // The refusal is the answer: no user is asked for, and nothing is retried.
    expect(backend.seen.map((entry) => entry.split(' credentials')[0])).toEqual([
      'GET /sanctum/csrf-cookie',
      'POST /login',
    ])
    expect(app.store.user).toBeNull()
  })

  it('replays a sign-in refused over a stale token once, with a new one', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    const app = wire()
    // The session the token was issued for is gone by the time the form is sent.
    let lost = false
    server.use(
      http.post('*/login', () => {
        if (lost) return undefined
        lost = true
        backend.token = 'reissued-elsewhere'
        return undefined
      }),
    )

    const session = await signIn(app)

    expect(backend.seen.map((entry) => entry.split(' body')[0])).toEqual([
      'GET /sanctum/csrf-cookie credentials=include authorization=- xsrf=-',
      'POST /login credentials=include authorization=- xsrf=xsrf-1=',
      'GET /sanctum/csrf-cookie credentials=include authorization=- xsrf=-',
      'POST /login credentials=include authorization=- xsrf=xsrf-2=',
      'GET /api/user credentials=include authorization=- xsrf=xsrf-3=',
    ])
    expect(session).toEqual({ user })
  })

  it('does not loop when the backend refuses every token: one replay, then the refusal', async () => {
    configure(...SANCTUM)
    const seen: string[] = []
    server.use(
      http.get('*/sanctum/csrf-cookie', async ({ request }) => {
        seen.push(await line(request))
        document.cookie = `XSRF-TOKEN=never-accepted-${seen.length}; path=/`
        return noContent()
      }),
      http.post('*/login', async ({ request }) => {
        seen.push(await line(request))
        return tokenMismatch()
      }),
    )
    const app = wire()

    const refused = await signIn(app).catch((error: unknown) => error)

    expect(refused).toMatchObject({ status: 419, code: 'CSRF_TOKEN_MISMATCH' })
    expect(seen.map((entry) => entry.split(' credentials')[0])).toEqual([
      'GET /sanctum/csrf-cookie',
      'POST /login',
      'GET /sanctum/csrf-cookie',
      'POST /login',
    ])
  })

  it('replays a write refused over a stale token in mid-session, once', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    const app = wire()
    await signIn(app)
    backend.seen.length = 0
    // The backend regenerated the token; the page still holds the old cookie.
    backend.token = 'regenerated'

    const created = await apiFetch('/things', { method: 'POST', body: { a: 1 } })

    expect(created).toEqual({ id: 1 })
    expect(backend.seen).toEqual([
      'POST /api/things credentials=include authorization=- xsrf=xsrf-2= body={"a":1}',
      'GET /sanctum/csrf-cookie credentials=include authorization=- xsrf=- body=-',
      'POST /api/things credentials=include authorization=- xsrf=xsrf-3= body={"a":1}',
    ])
    expect(app.router.replace).not.toHaveBeenCalled()
    expect(app.store.user).toEqual(user)
  })

  it('ends on a 401 in mid-session: no refresh request, and one redirect with the way back', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    const app = wire()
    await signIn(app)
    backend.seen.length = 0
    // The server session ran out.
    backend.session = null

    const answers = await Promise.allSettled([
      apiFetch('/things'),
      apiFetch('/things'),
      apiFetch('/things', { method: 'POST', body: { a: 1 } }),
    ])

    for (const answer of answers) {
      expect(answer.status).toBe('rejected')
      expect((answer as PromiseRejectedResult).reason).toMatchObject({ status: 401 })
    }
    // The three requests, each sent once: nothing was refreshed or replayed.
    expect(backend.seen.map((entry) => entry.split(' credentials')[0] ?? '').toSorted()).toEqual([
      'GET /api/things',
      'GET /api/things',
      'POST /api/things',
    ])
    expect(app.router.replace).toHaveBeenCalledExactlyOnceWith({
      name: '/auth/login',
      query: { redirect: '/dashboard/customers?page=2', reason: 'expired' },
    })
    expect(app.store.user).toBeNull()
    expect(app.store.isAuthenticated).toBe(false)
  })

  it('returns to the same place after signing in again', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    const app = wire()
    await signIn(app)
    backend.session = null
    await apiFetch('/things').catch(() => {})
    backend.seen.length = 0

    await signIn(app)
    await apiFetch('/things')

    expect(backend.seen.map((entry) => entry.split(' credentials')[0])).toEqual([
      'GET /sanctum/csrf-cookie',
      'POST /login',
      'GET /api/user',
      'GET /api/things',
    ])
    // One expiry, reported once: the new session is not ended by the old one.
    expect(app.router.replace).toHaveBeenCalledTimes(1)
    expect(app.store.user).toEqual(user)
  })

  it('resumes quietly to signed out when nobody is signed in', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    const { store, router } = wire()

    await restoreSessionForBoot(store, { adapterName: 'session', createAuthAdapter })

    expect(backend.seen).toEqual([
      'GET /api/user credentials=include authorization=- xsrf=- body=-',
    ])
    expect(store.user).toBeNull()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it.each([
    ['a 503', () => HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 })],
    ['no answer at all', () => HttpResponse.error()],
  ])(
    'treats %s on resume as signed out for this page load, and ends nothing',
    async (_, answer) => {
      configure(...SANCTUM)
      const backend = sanctumBackend()
      backend.session = laravelUser
      document.cookie = 'XSRF-TOKEN=held; path=/'
      server.use(
        http.get('*/api/user', async ({ request }) => {
          backend.seen.push(await line(request))
          return answer()
        }),
      )
      const { store, router } = wire()
      const logged = captureLogged()

      await restoreSessionForBoot(store, { adapterName: 'session', createAuthAdapter })

      logged.restore()
      // One question, and no logout: the session the backend holds is untouched.
      expect(backend.seen.map((entry) => entry.split(' credentials')[0])).toEqual(['GET /api/user'])
      expect(backend.session).toBe(laravelUser)
      expect(document.cookie).toContain('XSRF-TOKEN=held')
      expect(store.user).toBeNull()
      expect(router.replace).not.toHaveBeenCalled()
      expect(logged.warnings().join('\n')).toMatch(/Could not ask the backend whether there is a/)
    },
  )

  it('sends no Authorization header and writes nothing to storage, start to finish', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    const app = wire()

    await signIn(app)
    await apiFetch('/things')
    await apiFetch('/things', { method: 'POST', body: { a: 1 } })
    await restoreSessionForBoot(app.store, { adapterName: 'session', createAuthAdapter })
    await app.adapter.logout()
    app.store.clearAuth('logout')

    expect(backend.seen.length).toBeGreaterThanOrEqual(6)
    for (const entry of backend.seen) {
      expect(entry).toContain('credentials=include')
      expect(entry).toContain('authorization=-')
    }
    expect(Object.keys(localStorage)).toEqual([])
    expect(Object.keys(sessionStorage)).toEqual([])
  })

  it('uses the user a login answers with, and holds no token the answer carried', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    server.use(
      http.post('*/login', async ({ request }) => {
        backend.seen.push(await line(request))
        backend.session = laravelUser
        return HttpResponse.json({
          user: laravelUser,
          token: 'a-token-the-backend-also-sent',
          refreshToken: 'and-a-refresh-token',
          expiresIn: 900,
        })
      }),
    )
    const app = wire()

    const session = await signIn(app)

    expect(backend.seen.map((entry) => entry.split(' credentials')[0])).toEqual([
      'GET /sanctum/csrf-cookie',
      'POST /login',
    ])
    expect(session).toEqual({ user })
    expect(app.store.token).toBeFalsy()
    expect(app.store.refreshToken).toBeNull()
  })

  it('asks who signed in when the answer has a body that names nobody', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    server.use(
      http.post('*/login', async ({ request }) => {
        backend.seen.push(await line(request))
        backend.session = laravelUser
        // Fortify's JSON login response.
        return HttpResponse.json({ two_factor: false })
      }),
    )
    const app = wire()

    const session = await signIn(app)

    expect(backend.seen.at(-1)).toMatch(/^GET \/api\/user /)
    expect(session).toEqual({ user })
  })

  it('says the cookie did not come back when the sign-in succeeds and the user is then refused', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    // The browser dropped the session cookie: Secure over http, SameSite, a
    // Domain for another host. The backend accepted the sign-in all the same.
    server.use(http.get('*/api/user', () => unauthenticated()))
    const app = wire()
    const logged = captureLogged()

    const refused = await signIn(app).catch((error: unknown) => error)

    logged.restore()
    expect(refused).toMatchObject({
      status: 401,
      code: 'SESSION_NOT_ESTABLISHED',
      kind: 'contract',
      message: expect.stringMatching(/session cookie was not stored or not sent/),
    })
    expect((refused as AppError).serverMessage).toBeUndefined()
    expect(backend.seen.map((entry) => entry.split(' credentials')[0])).toEqual([
      'GET /sanctum/csrf-cookie',
      'POST /login',
    ])
    expect(app.router.replace).not.toHaveBeenCalled()
  })

  it('offers what Sanctum has routes for, and nothing it does not', async () => {
    configure(...SANCTUM)
    const { adapter } = wire()

    expect(adapter.name).toBe('session')
    expect(adapter.transport).toBe('cookie')
    expect(adapter.capabilities).toEqual({
      register: true,
      social: false,
      magicLink: false,
      mfa: false,
      refresh: false,
      codeExchange: false,
    })
    expect(adapter.canRefreshSession?.()).toBe(false)
    await expect(adapter.refreshSession?.()).resolves.toBeNull()
    for (const member of ['sendMagicLink', 'verifyMagicLink', 'setupMfa', 'verifyMfa'] as const) {
      expect(adapter[member]).toBeUndefined()
    }
    expect(adapter.refreshToken).toBeUndefined()
    expect(adapter.socialLogin).toBeUndefined()
    expect(adapter.exchangeCode).toBeUndefined()
  })

  it('registers the same way a login goes: token first, then the form, then the user', async () => {
    configure(...SANCTUM)
    const backend = sanctumBackend()
    server.use(
      http.post('*/register', async ({ request }) => {
        backend.seen.push(await line(request))
        backend.session = laravelUser
        return noContent()
      }),
    )
    const { adapter } = wire()

    const session = await adapter.register!({
      email: laravelUser.email,
      password: 'correct',
      name: laravelUser.name,
    })

    expect(backend.seen.map((entry) => entry.split(' body')[0])).toEqual([
      'GET /sanctum/csrf-cookie credentials=include authorization=- xsrf=-',
      'POST /register credentials=include authorization=- xsrf=xsrf-1=',
      'GET /api/user credentials=include authorization=- xsrf=xsrf-1=',
    ])
    expect(session).toEqual({ user })
  })
})

describe('with the default endpoints and nothing in api.overrides.ts', () => {
  const plainUser = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.test', role: 'manager' }

  /** The documented Vuestrata paths, answered by a backend that keeps a cookie session. */
  function cookieBackend() {
    const state = { signedIn: false, seen: [] as string[] }
    const record = async (request: Request) =>
      state.seen.push(
        `${await line(request)} csrf=${request.headers.get('X-CSRF-Token') ?? '-'}`.replace(
          / xsrf=-/,
          '',
        ),
      )
    server.use(
      http.post('*/api/auth/login', async ({ request }) => {
        await record(request)
        state.signedIn = request.credentials === 'include'
        return noContent()
      }),
      http.get('*/api/auth/me', async ({ request }) => {
        await record(request)
        return state.signedIn ? HttpResponse.json(plainUser) : unauthenticated()
      }),
      http.post('*/api/auth/logout', async ({ request }) => {
        await record(request)
        state.signedIn = false
        return noContent()
      }),
      http.get('*/api/things', async ({ request }) => {
        await record(request)
        return state.signedIn ? HttpResponse.json([]) : unauthenticated()
      }),
    )
    return state
  }

  it('signs in, resumes and signs out on the documented paths, with the meta-tag token', async () => {
    const tag = document.createElement('meta')
    tag.setAttribute('name', 'csrf-token')
    tag.setAttribute('content', 'meta-token')
    document.head.append(tag)
    const backend = cookieBackend()
    const app = wire()

    const session = await signIn(app)
    await restoreSessionForBoot(app.store, { adapterName: 'session', createAuthAdapter })
    await app.adapter.logout()

    expect(backend.seen).toEqual([
      // No prime step in the default strategy, so nothing is fetched first.
      `POST /api/auth/login credentials=include authorization=- body=${CREDENTIALS} csrf=meta-token`,
      'GET /api/auth/me credentials=include authorization=- body=- csrf=meta-token',
      'GET /api/auth/me credentials=include authorization=- body=- csrf=meta-token',
      'POST /api/auth/logout credentials=include authorization=- body=- csrf=meta-token',
    ])
    expect(session).toEqual({ user: plainUser })
  })

  it('ends on a 401 in mid-session there too, with no refresh request', async () => {
    const backend = cookieBackend()
    const app = wire()
    await signIn(app)
    backend.seen.length = 0
    backend.signedIn = false

    await expect(apiFetch('/things')).rejects.toMatchObject({ status: 401 })

    expect(backend.seen).toEqual([
      'GET /api/things credentials=include authorization=- body=- csrf=-',
    ])
    expect(app.router.replace).toHaveBeenCalledTimes(1)
    expect(app.store.user).toBeNull()
  })

  it('offers everything the default endpoint table has, except a refresh', () => {
    const { adapter } = wire()

    expect(adapter.capabilities).toEqual({
      register: true,
      social: false,
      magicLink: true,
      mfa: true,
      refresh: false,
      codeExchange: false,
    })
    expect(adapter.refreshToken).toBeUndefined()
  })

  it('does not offer what auth.config.ts disclaims or switches off', () => {
    configure({ endpoints: { register: null }, capabilities: { mfa: false } })
    const { adapter } = wire()

    expect(adapter.capabilities).toMatchObject({ register: false, mfa: false, magicLink: true })
    expect(adapter.register).toBeUndefined()
    expect(adapter.setupMfa).toBeUndefined()
  })
})

describe('with Django REST Framework’s conventions', () => {
  const drfUser = { pk: 3, email: 'ada@example.test', first_name: 'Ada', last_name: 'Lovelace' }
  const DRF: [AuthConfig, ApiOverrides] = [
    {
      // dj-rest-auth mounted under the API, as its installation notes show.
      endpoints: {
        login: '/auth/login/',
        logout: '/auth/logout/',
        me: '/auth/user/',
        register: null,
        refresh: null,
        magicLink: null,
        magicLinkVerify: null,
        mfaSetup: null,
        mfaVerify: null,
        mfaDisable: null,
      },
      mapUser: (raw) => {
        const record = raw as typeof drfUser
        return {
          id: String(record.pk),
          email: record.email,
          name: `${record.first_name} ${record.last_name}`,
          role: 'member',
        }
      },
    },
    { backend: presets.django },
  ]

  it('reads the 403 an anonymous request gets as "nobody is signed in", quietly', async () => {
    configure(...DRF)
    const seen: string[] = []
    server.use(
      http.get('*/api/auth/user/', async ({ request }) => {
        seen.push(await line(request))
        return HttpResponse.json(
          { detail: 'Authentication credentials were not provided.' },
          { status: 403 },
        )
      }),
    )
    const { store, router } = wire()

    await restoreSessionForBoot(store, { adapterName: 'session', createAuthAdapter })

    expect(seen).toHaveLength(1)
    expect(store.user).toBeNull()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('sends the csrftoken cookie as X-CSRFToken, and keeps the 400 a wrong password gets', async () => {
    configure(...DRF)
    document.cookie = 'csrftoken=django-token; path=/'
    const seen: string[] = []
    server.use(
      http.post('*/api/auth/login/', async ({ request }) => {
        seen.push(`${request.method} ${new URL(request.url).pathname}`)
        seen.push(`X-CSRFToken=${request.headers.get('X-CSRFToken')}`)
        return HttpResponse.json(
          { non_field_errors: ['Unable to log in with provided credentials.'] },
          { status: 400 },
        )
      }),
    )
    const app = wire()

    const refused = await signIn(app, 'wrong').catch((error: unknown) => error)

    // The preset names no prime step, so the cookie the page holds is the token.
    expect(seen).toEqual(['POST /api/auth/login/', 'X-CSRFToken=django-token'])
    expect(refused).toMatchObject({
      status: 400,
      formErrors: ['Unable to log in with provided credentials.'],
    })
  })

  it('holds no token when dj-rest-auth answers the login with one', async () => {
    configure(...DRF)
    document.cookie = 'csrftoken=django-token; path=/'
    server.use(
      http.post('*/api/auth/login/', () => HttpResponse.json({ key: '9944b09199c62bcf9418' })),
      http.get('*/api/auth/user/', () => HttpResponse.json(drfUser)),
    )
    const app = wire()

    const session = await signIn(app)

    expect(session).toEqual({
      user: { id: '3', email: 'ada@example.test', name: 'Ada Lovelace', role: 'member' },
    })
    expect(app.store.token).toBeFalsy()
  })
})

describe('the CSRF strategy a session needs', () => {
  it('warns once at boot, naming api.overrides.ts, when the page has no token to read', () => {
    const logged = captureLogged()

    wire()

    logged.restore()
    const warnings = logged.warnings().filter((warning) => warning.includes('CSRF'))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/VUESTRATA_AUTH_ADAPTER=session/)
    expect(warnings[0]).toMatch(/src\/modules\/app\/config\/api\.overrides\.ts/)
    expect(warnings[0]).toMatch(/<meta name="csrf-token">/)
  })

  it.each<[string, ApiOverrides]>([
    ['a backend preset', { backend: presets.laravel }],
    ['a cookie strategy', { csrf: csrfPresets.django }],
    ['no CSRF header at all', { csrf: { source: 'none' } }],
    ['a meta strategy that can fetch a token', { csrf: { ...csrfPresets.rails, prime: '/csrf' } }],
  ])('says nothing with %s', (_, api) => {
    configure({}, api)
    const logged = captureLogged()

    wire()

    logged.restore()
    expect(logged.warnings().filter((warning) => warning.includes('CSRF'))).toEqual([])
  })

  it('says nothing when the server rendered the tag', () => {
    const tag = document.createElement('meta')
    tag.setAttribute('name', 'csrf-token')
    tag.setAttribute('content', 'meta-token')
    document.head.append(tag)
    const logged = captureLogged()

    wire()

    logged.restore()
    expect(logged.warnings().filter((warning) => warning.includes('CSRF'))).toEqual([])
  })

  it('says nothing for the oauth adapter, whose behaviour is unchanged', () => {
    const logged = captureLogged()
    const store = useAuthStore()

    setupAuthInterceptor(store, {
      adapterName: 'oauth',
      createAuthAdapter,
      router: { replace: vi.fn(), currentRoute: { value: undefined } } as unknown as Parameters<
        typeof setupAuthInterceptor
      >[1]['router'],
    })

    logged.restore()
    expect(logged.warnings().filter((warning) => warning.includes('CSRF'))).toEqual([])
  })
})
