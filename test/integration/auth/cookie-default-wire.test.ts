import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import { restoreSessionForBoot, setupAuthInterceptor } from '@/bootstrap/auth-wiring'
import { apiFetch } from '@/lib/api/client'
import { resolveAuthEndpoints } from '@/lib/auth/endpoints'
import { AppError } from '@/lib/errors'
import { createAuthAdapter } from '@/modules/auth'
import { useAuthStore } from '@/stores/auth'
import { runtimeEnv } from '~/lib/config'
import type { User } from '~/types'

/**
 * What a cookie-transport session puts on the wire when a project has left
 * `auth.config.ts` and `api.overrides.ts` as shipped.
 *
 * `default-wire-contract.test.ts` pins the requests each built-in adapter
 * makes. This file pins what surrounds them under the cookie transport: how a
 * write is protected, what a 401 in mid-session does, how a resume that fails
 * is treated, and what an answer with no body means. It was written before the
 * `session` adapter existed, against the `oauth` adapter, which was the only
 * cookie-transport adapter then. Everything here must stay exactly as it is
 * for a project that never selects the new adapter, so no line below changes
 * without that being a decision about every such project.
 */

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore().reset()
  runtimeEnv.sessionPersistence = DEFAULT_PERSISTENCE
  sessionStorage.clear()
  localStorage.clear()
  document.head.querySelectorAll('meta[name="csrf-token"]').forEach((tag) => tag.remove())
})
afterAll(() => server.close())

const DEFAULT_PERSISTENCE = runtimeEnv.sessionPersistence

const user = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  role: 'manager',
} as User

/** One request, as a single comparable line. */
async function line(request: Request): Promise<string> {
  const url = new URL(request.url)
  const body = await request.clone().text()
  return [
    request.method,
    `${url.pathname}${url.search}`,
    `credentials=${request.credentials}`,
    `authorization=${request.headers.get('Authorization') ?? '-'}`,
    `csrf=${request.headers.get('X-CSRF-Token') ?? '-'}`,
    `xsrf=${request.headers.get('X-XSRF-TOKEN') ?? '-'}`,
    `body=${body || '-'}`,
  ].join(' ')
}

/** Record every request, and answer the ones a test did not script with a 404. */
function recorder() {
  const seen: string[] = []
  server.use(
    http.all('*', async ({ request }) => {
      seen.push(await line(request))
      // Falls through to the handlers a test registered before this one.
    }),
  )
  return seen
}

const PROTECTED_ROUTE = {
  fullPath: '/dashboard/customers?page=2',
  path: '/dashboard/customers',
  meta: { requiresAuth: true },
}

function wire(adapterName: 'oauth' | 'jwt') {
  runtimeEnv.sessionPersistence = 'none'
  const store = useAuthStore()
  const router = { replace: vi.fn(async () => {}), currentRoute: { value: PROTECTED_ROUTE } }
  setupAuthInterceptor(store, {
    adapterName,
    createAuthAdapter,
    router: router as unknown as Parameters<typeof setupAuthInterceptor>[1]['router'],
  })
  return { store, router }
}

function withMetaToken(token: string) {
  const tag = document.createElement('meta')
  tag.setAttribute('name', 'csrf-token')
  tag.setAttribute('content', token)
  document.head.append(tag)
}

function seedPkceState() {
  sessionStorage.setItem('vuestrata-oauth-state', 'state-1')
  sessionStorage.setItem('vuestrata-oauth-verifier', 'verifier-1')
  sessionStorage.setItem('vuestrata-oauth-state-ts', String(Date.now()))
}

describe('the endpoint table of an untouched auth.config.ts', () => {
  it('is the documented one: a path and a method each, and nothing else', () => {
    expect(resolveAuthEndpoints()).toStrictEqual({
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
})

describe('a cookie-transport session with the seeded files as shipped', () => {
  it('sends a write with cookies and the meta-tag token, and fetches nothing first', async () => {
    server.use(http.post('*/api/things', () => HttpResponse.json({ ok: true })))
    const seen = recorder()
    withMetaToken('meta-token')
    const { store } = wire('oauth')
    store.setUser(user)

    await apiFetch('/things', { method: 'POST', body: { a: 1 } })

    expect(seen).toEqual([
      'POST /api/things credentials=include authorization=- csrf=meta-token xsrf=- body={"a":1}',
    ])
  })

  it('sends a write without a token when the page has no meta tag, and still fetches nothing', async () => {
    server.use(http.post('*/api/things', () => HttpResponse.json({ ok: true })))
    const seen = recorder()
    const { store } = wire('oauth')
    store.setUser(user)

    await apiFetch('/things', { method: 'POST', body: { a: 1 } })

    expect(seen).toEqual([
      'POST /api/things credentials=include authorization=- csrf=- xsrf=- body={"a":1}',
    ])
  })

  it('ends on a 401 in mid-session: no refresh request, and one redirect with the way back', async () => {
    server.use(
      http.get('*/api/things/:id', () =>
        HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 }),
      ),
    )
    const seen = recorder()
    const { store, router } = wire('oauth')
    store.setUser(user)

    const answers = await Promise.allSettled([
      apiFetch('/things/1'),
      apiFetch('/things/2'),
      apiFetch('/things/3'),
    ])

    expect(answers.map((answer) => answer.status)).toEqual(['rejected', 'rejected', 'rejected'])
    for (const answer of answers) {
      const reason = (answer as PromiseRejectedResult).reason as AppError
      expect(reason).toBeInstanceOf(AppError)
      expect(reason.status).toBe(401)
    }
    expect(seen.toSorted()).toEqual([
      'GET /api/things/1 credentials=include authorization=- csrf=- xsrf=- body=-',
      'GET /api/things/2 credentials=include authorization=- csrf=- xsrf=- body=-',
      'GET /api/things/3 credentials=include authorization=- csrf=- xsrf=- body=-',
    ])
    expect(router.replace).toHaveBeenCalledExactlyOnceWith({
      name: '/auth/login',
      query: { redirect: '/dashboard/customers?page=2', reason: 'expired' },
    })
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('resumes quietly to signed out when the backend answers 401', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 }),
      ),
    )
    const seen = recorder()
    const { store, router } = wire('oauth')

    await restoreSessionForBoot(store, { adapterName: 'oauth', createAuthAdapter })

    expect(seen).toEqual([
      'GET /api/auth/me credentials=include authorization=- csrf=- xsrf=- body=-',
    ])
    expect(store.user).toBeNull()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it.each([
    ['a 503', () => HttpResponse.json({ message: 'Down for maintenance' }, { status: 503 })],
    ['no answer at all', () => HttpResponse.error()],
  ])('resumes to signed out for this page load on %s, asking once', async (_, answer) => {
    server.use(http.get('*/api/auth/me', answer))
    const seen = recorder()
    const { store, router } = wire('oauth')

    await restoreSessionForBoot(store, { adapterName: 'oauth', createAuthAdapter })

    expect(seen).toEqual([
      'GET /api/auth/me credentials=include authorization=- csrf=- xsrf=- body=-',
    ])
    expect(store.user).toBeNull()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('reads a session-starting answer with no body as a contract mismatch, and asks nothing more', async () => {
    server.use(http.post('*/api/auth/token', () => new HttpResponse(null, { status: 204 })))
    const seen = recorder()
    wire('oauth')
    seedPkceState()

    const exchanged = createAuthAdapter('oauth').exchangeCode!('code-1', 'state-1')

    await expect(exchanged).rejects.toMatchObject({ code: 'CONTRACT_MISMATCH', kind: 'contract' })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatch(/^POST \/api\/auth\/token credentials=include authorization=- /)
  })

  it('asks who the session belongs to when the answer names nobody, and passes on a 401 as it is', async () => {
    server.use(
      http.post('*/api/auth/token', () => HttpResponse.json({})),
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 }),
      ),
    )
    const seen = recorder()
    wire('oauth')
    seedPkceState()

    const exchanged = createAuthAdapter('oauth').exchangeCode!('code-1', 'state-1')

    await expect(exchanged).rejects.toMatchObject({
      status: 401,
      code: 'API_ERROR',
      message: 'Unauthenticated.',
    })
    expect(seen.map((entry) => entry.split(' ').slice(0, 2).join(' '))).toEqual([
      'POST /api/auth/token',
      'GET /api/auth/me',
    ])
  })

  it('writes nothing to Web Storage beyond the PKCE state the sign-in itself needs', async () => {
    server.use(
      http.post('*/api/auth/token', () => HttpResponse.json({ user })),
      http.post('*/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
    )
    const { store } = wire('oauth')
    seedPkceState()
    const adapter = createAuthAdapter('oauth')

    const session = await adapter.exchangeCode!('code-1', 'state-1')
    store.setAuth(session.user, session.token, session.refreshToken, session.expiresIn)
    await adapter.logout()

    expect(Object.keys(localStorage)).toEqual([])
    expect(Object.keys(sessionStorage)).toEqual([])
  })
})

describe('a bearer session with the seeded files as shipped', () => {
  it('reads a login answered with no body as a contract mismatch, and asks nothing more', async () => {
    server.use(http.post('*/api/auth/login', () => new HttpResponse(null, { status: 204 })))
    const seen = recorder()
    wire('jwt')

    const login = createAuthAdapter('jwt').login({ email: user.email, password: 'pw' })

    await expect(login).rejects.toMatchObject({ code: 'CONTRACT_MISMATCH', kind: 'contract' })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatch(/^POST \/api\/auth\/login credentials=omit authorization=- /)
  })
})
