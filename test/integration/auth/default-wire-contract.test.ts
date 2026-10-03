import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import { restoreSessionForBoot, setupAuthInterceptor } from '@/bootstrap/auth-wiring'
import { createAuthAdapter } from '@/modules/auth'
import { useAuthStore } from '@/stores/auth'
import { runtimeEnv, type SessionPersistence } from '~/lib/config'
import type { User } from '~/types'

/**
 * What the built-in adapters put on the wire, request by request.
 *
 * This is the contract a backend written against the documented endpoints
 * depends on: the method, the path, whether cookies travel, which credential is
 * presented and the exact body. It is pinned as literals on purpose. The
 * endpoints, bodies and response shapes can be configured from
 * `app/config/auth.config.ts`, and a project that configures nothing must keep
 * sending exactly this — so a change to any line below is a change to every
 * such project's backend contract, and has to be made knowingly.
 */

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore().reset()
  runtimeEnv.sessionPersistence = DEFAULT_PERSISTENCE
  sessionStorage.clear()
  localStorage.clear()
  vi.unstubAllGlobals()
})
afterAll(() => server.close())

const DEFAULT_PERSISTENCE = runtimeEnv.sessionPersistence

const user = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  role: 'manager',
} as User

/**
 * An access token the jwt adapter reads as live: it skips `/auth/me` for one
 * that is not a JWT or has run out. Expires in 2100, and the backend below
 * sends no `expiresIn` beside it, so the store has nothing to reconcile.
 */
const ACCESS = [
  btoa(JSON.stringify({ alg: 'none', typ: 'JWT' })),
  btoa(JSON.stringify({ exp: 4_102_444_800 })),
  'sig',
]
  .join('.')
  .replaceAll('=', '')

/** One request, as a single comparable line. */
async function line(request: Request): Promise<string> {
  const url = new URL(request.url)
  const body = await request.clone().text()
  return [
    request.method,
    `${url.pathname}${url.search}`,
    `credentials=${request.credentials}`,
    `authorization=${request.headers.get('Authorization')?.replace(ACCESS, 'access') ?? '-'}`,
    `body=${body || '-'}`,
  ].join(' ')
}

/** Answers anything under the API base with a full session, recording how it was asked. */
function recordingBackend() {
  const seen: string[] = []
  server.use(
    http.get('*/api/auth/me', async ({ request }) => {
      seen.push(await line(request))
      return HttpResponse.json(user)
    }),
    http.all('*/api/auth/*', async ({ request }) => {
      seen.push(await line(request))
      return HttpResponse.json({ user, token: ACCESS, refreshToken: 'refresh' })
    }),
  )
  return seen
}

function wire(adapterName: string, mode: SessionPersistence) {
  runtimeEnv.sessionPersistence = mode
  const store = useAuthStore()
  const router = { replace: vi.fn(), currentRoute: { value: undefined } }
  setupAuthInterceptor(store, {
    adapterName,
    createAuthAdapter,
    router: router as unknown as Parameters<typeof setupAuthInterceptor>[1]['router'],
  })
  return store
}

/** Every request an adapter built the way the bootstrap builds it can make. */
async function callEverything(adapterName: 'jwt' | 'mock') {
  const store = useAuthStore()
  const adapter = createAuthAdapter(adapterName, {
    getToken: () => store.token,
    getRefreshToken: () => store.refreshToken,
  })

  const session = await adapter.login({ email: user.email, password: 'pw' })
  store.setAuth(session.user, session.token, session.refreshToken, session.expiresIn)
  await adapter.register!({ email: user.email, password: 'pw', name: user.name })
  await adapter.getUser()
  await adapter.sendMagicLink!({ email: user.email })
  await adapter.verifyMagicLink!('magic')
  await adapter.setupMfa!()
  await adapter.verifyMfa!({ mfaToken: 'mfa', code: '000000' })
  await adapter.disableMfa!()
  await adapter.refreshToken!('held-refresh')
  await adapter.refreshSession?.()
  await adapter.logout()
  store.clearRefreshTimer()
}

describe('the jwt adapter', () => {
  it('sends exactly these requests under refresh-cookie', async () => {
    const seen = recordingBackend()
    wire('jwt', 'refresh-cookie')

    await callEverything('jwt')

    expect(seen).toEqual([
      'POST /api/auth/login credentials=include authorization=- body={"email":"ada@example.test","password":"pw"}',
      'POST /api/auth/register credentials=include authorization=Bearer access body={"email":"ada@example.test","password":"pw","name":"Ada Lovelace"}',
      'GET /api/auth/me credentials=include authorization=Bearer access body=-',
      'POST /api/auth/magic-link credentials=include authorization=Bearer access body={"email":"ada@example.test"}',
      'POST /api/auth/magic-link/verify credentials=include authorization=Bearer access body={"token":"magic"}',
      'POST /api/auth/mfa/setup credentials=include authorization=Bearer access body=-',
      'POST /api/auth/mfa/verify credentials=include authorization=Bearer access body={"mfaToken":"mfa","code":"000000"}',
      'POST /api/auth/mfa/disable credentials=include authorization=Bearer access body=-',
      'POST /api/auth/refresh credentials=include authorization=- body={"refreshToken":"held-refresh"}',
      // The login handed over a refresh token, so the session refresh presents
      // it rather than relying on a cookie this backend may not have set.
      'POST /api/auth/refresh credentials=include authorization=- body={"refreshToken":"refresh"}',
      'POST /api/auth/logout credentials=include authorization=Bearer access body=-',
    ])
  })

  it('sends exactly these requests when the refresh token is held in memory', async () => {
    const seen = recordingBackend()
    wire('jwt', 'none')

    await callEverything('jwt')

    expect(seen).toEqual([
      'POST /api/auth/login credentials=omit authorization=- body={"email":"ada@example.test","password":"pw"}',
      'POST /api/auth/register credentials=omit authorization=Bearer access body={"email":"ada@example.test","password":"pw","name":"Ada Lovelace"}',
      'GET /api/auth/me credentials=omit authorization=Bearer access body=-',
      'POST /api/auth/magic-link credentials=omit authorization=Bearer access body={"email":"ada@example.test"}',
      'POST /api/auth/magic-link/verify credentials=omit authorization=Bearer access body={"token":"magic"}',
      'POST /api/auth/mfa/setup credentials=omit authorization=Bearer access body=-',
      'POST /api/auth/mfa/verify credentials=omit authorization=Bearer access body={"mfaToken":"mfa","code":"000000"}',
      'POST /api/auth/mfa/disable credentials=omit authorization=Bearer access body=-',
      'POST /api/auth/refresh credentials=omit authorization=- body={"refreshToken":"held-refresh"}',
      'POST /api/auth/refresh credentials=omit authorization=- body={"refreshToken":"refresh"}',
      'POST /api/auth/logout credentials=omit authorization=Bearer access body=-',
    ])
  })

  it('resumes from the refresh cookie with an empty body, then asks who that is', async () => {
    const seen: string[] = []
    server.use(
      http.post('*/api/auth/refresh', async ({ request }) => {
        seen.push(await line(request))
        // The documented answer: tokens, and no user.
        return HttpResponse.json({ token: 'access-2', expiresIn: 900 })
      }),
      http.get('*/api/auth/me', async ({ request }) => {
        seen.push(await line(request))
        return HttpResponse.json(user)
      }),
    )
    const store = wire('jwt', 'refresh-cookie')

    await restoreSessionForBoot(store, { adapterName: 'jwt', createAuthAdapter })
    store.clearRefreshTimer()

    expect(seen).toEqual([
      'POST /api/auth/refresh credentials=include authorization=- body=-',
      'GET /api/auth/me credentials=include authorization=Bearer access-2 body=-',
    ])
    expect(store.user).toEqual(user)
    expect(store.token).toBe('access-2')
  })

  it('resumes from a refresh token kept in Web Storage', async () => {
    const seen: string[] = []
    server.use(
      http.post('*/api/auth/refresh', async ({ request }) => {
        seen.push(await line(request))
        return HttpResponse.json({ token: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 })
      }),
      http.get('*/api/auth/me', async ({ request }) => {
        seen.push(await line(request))
        return HttpResponse.json(user)
      }),
    )
    const store = wire('jwt', 'session')
    sessionStorage.setItem('vuestrata-refresh-token', 'refresh-1')

    await restoreSessionForBoot(store, { adapterName: 'jwt', createAuthAdapter })
    store.clearRefreshTimer()

    expect(seen).toEqual([
      'POST /api/auth/refresh credentials=omit authorization=- body={"refreshToken":"refresh-1"}',
      'GET /api/auth/me credentials=omit authorization=Bearer access-2 body=-',
    ])
    expect(store.refreshToken).toBe('refresh-2')
  })
})

describe('the oauth adapter', () => {
  it('sends exactly these requests, with cookies and no bearer token', async () => {
    const seen = recordingBackend()
    const store = wire('oauth', 'none')
    const adapter = createAuthAdapter('oauth')
    sessionStorage.setItem('vuestrata-oauth-state', 'state-1')
    sessionStorage.setItem('vuestrata-oauth-verifier', 'verifier-1')
    sessionStorage.setItem('vuestrata-oauth-state-ts', String(Date.now()))

    await adapter.exchangeCode!('code-1', 'state-1')
    await adapter.getUser()
    await restoreSessionForBoot(store, { adapterName: 'oauth', createAuthAdapter })
    await adapter.logout()

    const callback = `${window.location.origin}/auth/callback`
    expect(seen).toEqual([
      `POST /api/auth/token credentials=include authorization=- body={"grant_type":"authorization_code","code":"code-1","code_verifier":"verifier-1","redirect_uri":"${callback}"}`,
      'GET /api/auth/me credentials=include authorization=- body=-',
      'GET /api/auth/me credentials=include authorization=- body=-',
      'POST /api/auth/logout credentials=include authorization=- body=-',
    ])
    expect(store.user).toEqual(user)
    expect(store.token).toBeNull()
  })

  it.each([
    ['login', '/api/auth/authorize'],
    ['socialLogin', '/api/auth/github'],
  ] as const)('%s redirects to %s with the PKCE parameters', async (method, path) => {
    const location = { origin: 'https://app.example.test', href: '' }
    vi.stubGlobal('location', location)
    wire('oauth', 'none')
    const adapter = createAuthAdapter('oauth')

    const started =
      method === 'login'
        ? adapter.login({ email: '', password: '' })
        : adapter.socialLogin!('github')
    await expect(started).rejects.toThrow(/redirecting/i)

    const target = new URL(location.href)
    expect(`${target.origin}${target.pathname}`).toBe(`https://app.example.test${path}`)
    expect([...target.searchParams.keys()]).toEqual([
      'response_type',
      'state',
      'code_challenge',
      'code_challenge_method',
      'redirect_uri',
    ])
    expect(target.searchParams.get('response_type')).toBe('code')
    expect(target.searchParams.get('code_challenge_method')).toBe('S256')
    expect(target.searchParams.get('redirect_uri')).toBe('https://app.example.test/auth/callback')
    expect(target.searchParams.get('state')).toBe(sessionStorage.getItem('vuestrata-oauth-state'))
  })
})

describe('the mock adapter', () => {
  it('sends exactly these requests', async () => {
    const seen = recordingBackend()
    wire('mock', 'none')

    await callEverything('mock')

    expect(seen).toEqual([
      'POST /api/auth/login credentials=omit authorization=- body={"email":"ada@example.test","password":"pw"}',
      'POST /api/auth/register credentials=omit authorization=Bearer access body={"email":"ada@example.test","password":"pw","name":"Ada Lovelace"}',
      'GET /api/auth/me credentials=omit authorization=Bearer access body=-',
      'POST /api/auth/magic-link credentials=omit authorization=Bearer access body={"email":"ada@example.test"}',
      'POST /api/auth/magic-link/verify credentials=omit authorization=Bearer access body={"token":"magic"}',
      'POST /api/auth/mfa/setup credentials=omit authorization=Bearer access body=-',
      'POST /api/auth/mfa/verify credentials=omit authorization=Bearer access body={"mfaToken":"mfa","code":"000000"}',
      'POST /api/auth/mfa/disable credentials=omit authorization=Bearer access body=-',
      'POST /api/auth/refresh credentials=omit authorization=- body={"refreshToken":"held-refresh"}',
      'POST /api/auth/logout credentials=omit authorization=Bearer access body=-',
    ])
  })
})
