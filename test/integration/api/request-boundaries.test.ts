import { delay, http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import { apiFetch, apiGet, apiPost, installApiAuth } from '@/lib/api/client'
import { resolveApiIntegration, type ApiOverrides } from '@/lib/api/integration'
import { presets } from '@/lib/api/presets'
import type { ApiAuthTransport } from '@/lib/api/types'
import { AppError } from '@/lib/errors'
import { __resetRuntimeSlots, installApiIntegration } from '@/lib/runtime'

import { resetRuntimeState } from '../../utils/reset-runtime-state'

/**
 * Where the client's reach ends: which requests carry the session and the
 * project's API headers, and how long a request may wait on the project's own
 * code before it is sent.
 *
 * Both are about what the seam must not make worse. `apiFetch` takes any URL,
 * and whatever a project adds for its API (a gateway key, a tenant, the CSRF
 * token) would go to every one of them; a request hook is awaited before the
 * request has a deadline, so one that never settles would hold it for ever.
 */

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(async () => {
  server.resetHandlers()
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
  __resetRuntimeSlots()
  await resetRuntimeState()
})
afterAll(() => server.close())

/**
 * Install what `api.overrides.ts` would resolve to, with a locale hook in the
 * place of the one the bootstrap contributes (which needs vue-i18n).
 */
function configure(overrides: ApiOverrides) {
  installApiIntegration(
    resolveApiIntegration(overrides, {
      requestHooks: [(request) => request.setHeader('Accept-Language', 'fr')],
    }),
  )
}

function signIn(transport: ApiAuthTransport = 'bearer', refreshToken: string | null = 'refresh-1') {
  const onSessionExpired = vi.fn()
  const session = { token: transport === 'bearer' ? 'session-token' : null }
  installApiAuth({
    transport,
    getToken: () => session.token,
    getRefreshToken: () => refreshToken,
    setAuth: (token) => {
      session.token = token
    },
    clearAuth: () => {
      session.token = null
    },
    onSessionExpired,
  })
  return { onSessionExpired, session }
}

async function failureOf(request: Promise<unknown>): Promise<AppError> {
  const error = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(AppError)
  return error as AppError
}

interface Seen {
  headers: Record<string, string>
  credentials: RequestCredentials
}

/** Record what each request matching `url` carried, and answer it with JSON. */
function record(url: string, method: 'get' | 'post' = 'post') {
  const seen: Seen[] = []
  server.use(
    http[method](url, ({ request }) => {
      seen.push({
        headers: Object.fromEntries(request.headers.entries()),
        credentials: request.credentials,
      })
      return HttpResponse.json({ ok: true })
    }),
  )
  return seen
}

/** Everything a project can add for its API, switched on at once. */
const EVERYTHING: ApiOverrides = {
  backend: presets.laravel,
  headers: { 'X-Api-Key': 'gateway-secret', 'X-Tenant': () => 'acme' },
  request: ({ setHeader }) => setHeader('X-Signature', 'signed'),
  tracing: true,
}

/** The header names that are the session's or the project's, and nobody else's. */
const PRIVATE_HEADERS = [
  'authorization',
  'x-xsrf-token',
  'x-csrf-token',
  'x-api-key',
  'x-tenant',
  'x-signature',
  'accept-language',
  'x-request-id',
  'traceparent',
]

const THIRD_PARTY = 'https://hooks.third-party.example/notify'

describe('a request to another origin', () => {
  it('carries nothing of the session or the project under the cookie transport', async () => {
    configure(EVERYTHING)
    signIn('cookie')
    document.cookie = 'XSRF-TOKEN=csrf-secret; path=/'
    const seen = record(THIRD_PARTY)

    await apiFetch(THIRD_PARTY, { method: 'POST', body: { event: 'order.placed' } })

    expect(seen).toHaveLength(1)
    for (const name of PRIVATE_HEADERS) expect(seen[0]!.headers).not.toHaveProperty(name)
    // No cookies either: under this transport every API request sends them.
    expect(seen[0]!.credentials).toBe('omit')
    // What it is and what the client can read still go along.
    expect(seen[0]!.headers).toMatchObject({
      accept: 'application/json',
      'content-type': 'application/json',
    })
  })

  it('does not carry the bearer token either', async () => {
    configure(EVERYTHING)
    signIn('bearer')
    const seen = record(THIRD_PARTY)

    await apiFetch(THIRD_PARTY, { method: 'POST', body: { event: 'order.placed' } })

    for (const name of PRIVATE_HEADERS) expect(seen[0]!.headers).not.toHaveProperty(name)
    expect(seen[0]!.credentials).toBe('omit')
  })

  it('does not with an empty overrides file either: the token was the leak before the seam', async () => {
    signIn('bearer')
    const seen = record(THIRD_PARTY, 'get')

    await apiGet(THIRD_PARTY)

    expect(seen[0]!.headers).not.toHaveProperty('authorization')
  })

  it('does not prime a CSRF token for it', async () => {
    configure(EVERYTHING)
    signIn('cookie')
    let primes = 0
    server.use(
      http.get('*/sanctum/csrf-cookie', () => {
        primes++
        return new HttpResponse(null, { status: 204 })
      }),
    )
    record(THIRD_PARTY)

    await apiFetch(THIRD_PARTY, { method: 'POST', body: {} })

    expect(primes).toBe(0)
  })

  it('keeps what the call itself put on it', async () => {
    configure(EVERYTHING)
    signIn('bearer')
    const seen = record(THIRD_PARTY)

    await apiFetch(THIRD_PARTY, {
      method: 'POST',
      body: {},
      headers: { Authorization: 'Bearer webhook-token', 'X-Tenant': 'theirs' },
      credentials: 'include',
    })

    expect(seen[0]!.headers).toMatchObject({
      authorization: 'Bearer webhook-token',
      'x-tenant': 'theirs',
    })
    expect(seen[0]!.credentials).toBe('include')
    expect(seen[0]!.headers).not.toHaveProperty('x-api-key')
  })

  it('carries all of it once the call says the origin is trusted', async () => {
    configure(EVERYTHING)
    signIn('cookie')
    document.cookie = 'XSRF-TOKEN=csrf-secret; path=/'
    const seen = record('https://files.acme.example/upload')

    await apiFetch('https://files.acme.example/upload', {
      method: 'POST',
      body: {},
      trusted: true,
    })

    expect(seen[0]!.credentials).toBe('include')
    expect(seen[0]!.headers).toMatchObject({
      'x-xsrf-token': 'csrf-secret',
      'x-api-key': 'gateway-secret',
      'x-tenant': 'acme',
      'x-signature': 'signed',
      'accept-language': 'fr',
    })
    expect(seen[0]!.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(seen[0]!.headers.traceparent).toMatch(/^00-/)
  })

  it('carries the bearer token once trusted, per call or for a whole client', async () => {
    configure(EVERYTHING)
    signIn('bearer')
    const seen = record('https://files.acme.example/upload')
    const files = apiFetch.create({ baseURL: 'https://files.acme.example', trusted: true })

    await apiFetch('https://files.acme.example/upload', { method: 'POST', body: {}, trusted: true })
    await files('/upload', { method: 'POST', body: {} })

    expect(seen.map((request) => request.headers.authorization)).toEqual([
      'Bearer session-token',
      'Bearer session-token',
    ])
  })

  it('is what a client made for another base URL talks to, until it is trusted', async () => {
    configure(EVERYTHING)
    signIn('bearer')
    const seen = record('https://files.acme.example/upload')
    const files = apiFetch.create({ baseURL: 'https://files.acme.example' })

    await files('/upload', { method: 'POST', body: {} })
    await apiFetch('/upload', { method: 'POST', body: {}, baseURL: 'https://files.acme.example' })

    for (const request of seen) {
      for (const name of PRIVATE_HEADERS) expect(request.headers).not.toHaveProperty(name)
    }
  })

  it('is not refreshed, replayed or signed out by a 401 from there', async () => {
    configure(EVERYTHING)
    const { onSessionExpired, session } = signIn('bearer')
    let refreshes = 0
    let requests = 0
    server.use(
      http.post('*/api/auth/refresh', () => {
        refreshes++
        return HttpResponse.json({ token: 'fresh-token', refreshToken: 'refresh-2' })
      }),
      http.get(THIRD_PARTY, () => {
        requests++
        return HttpResponse.json({ message: 'Bad API key.' }, { status: 401 })
      }),
    )

    const error = await failureOf(apiGet(THIRD_PARTY))

    // Their 401 is about their credentials. This app's session is untouched.
    expect(error).toMatchObject({ status: 401, kind: 'http', messageKey: 'errors.status_401' })
    expect(requests).toBe(1)
    expect(refreshes).toBe(0)
    expect(onSessionExpired).not.toHaveBeenCalled()
    expect(session.token).toBe('session-token')
  })

  it('is not read by the project’s classifiers', async () => {
    const classify = vi.fn(() => 'unauthenticated' as const)
    configure({ classify })
    signIn('bearer')
    record(THIRD_PARTY, 'get')

    await expect(apiGet(THIRD_PARTY)).resolves.toEqual({ ok: true })
    expect(classify).not.toHaveBeenCalled()
  })
})

describe('a request to the API origin', () => {
  const apiUrl = () => `${window.location.origin}/api/orders`

  it.each([
    ['a path', () => '/orders'],
    ['an absolute URL', apiUrl],
    ['an absolute URL in another case', () => apiUrl().replace('http://', 'HTTP://')],
  ])('carries everything, written as %s', async (_, url) => {
    configure(EVERYTHING)
    signIn('cookie')
    document.cookie = 'XSRF-TOKEN=csrf-secret; path=/'
    const seen = record('*/api/orders')

    await apiFetch(url(), { method: 'POST', body: { sku: 'A-1' } })

    expect(seen).toHaveLength(1)
    expect(seen[0]!.credentials).toBe('include')
    expect(seen[0]!.headers).toMatchObject({
      'x-xsrf-token': 'csrf-secret',
      'x-api-key': 'gateway-secret',
      'x-tenant': 'acme',
      'x-signature': 'signed',
      'accept-language': 'fr',
    })
  })

  it('carries the bearer token, by path and by absolute URL', async () => {
    signIn('bearer')
    const seen = record('*/api/orders', 'get')

    await apiGet('/orders')
    await apiGet(apiUrl())

    expect(seen.map((request) => request.headers.authorization)).toEqual([
      'Bearer session-token',
      'Bearer session-token',
    ])
    expect(seen.map((request) => request.credentials)).toEqual(['omit', 'omit'])
  })

  it('does not include a look-alike host', async () => {
    signIn('bearer')
    const lookalike = new URL(apiUrl())
    lookalike.hostname = `${lookalike.hostname}.evil.example`
    const seen = record(lookalike.href, 'get')

    await apiGet(lookalike.href)

    expect(seen).toHaveLength(1)
    expect(seen[0]!.headers).not.toHaveProperty('authorization')
  })

  // The client decides where a request goes by the test ofetch itself applies.
  // If the two disagreed, one of these would be sent to a host the client had
  // taken for the API, with the session on it.
  it.each(['//evil.example/steal', String.raw`\\evil.example\steal`, 'evil.example/steal'])(
    'sends %s to the API, as a path, and never to that host',
    async (path) => {
      signIn('bearer')
      const origins: string[] = []
      server.use(
        http.get(/evil\.example/, ({ request }) => {
          origins.push(new URL(request.url).origin)
          return HttpResponse.json({ ok: true })
        }),
      )

      await apiGet(path)

      expect(origins).toEqual([window.location.origin])
    },
  )

  it.each(['https://evil.example/steal', 'https:/evil.example/steal', ' https://evil.example/x'])(
    'sends %s to that host, without the session',
    async (url) => {
      signIn('bearer')
      const seen: { origin: string; authorization: string | null }[] = []
      server.use(
        http.get(/evil\.example/, ({ request }) => {
          seen.push({
            origin: new URL(request.url).origin,
            authorization: request.headers.get('Authorization'),
          })
          return HttpResponse.json({ ok: true })
        }),
      )

      await apiGet(url)

      expect(seen).toEqual([{ origin: 'https://evil.example', authorization: null }])
    },
  )
})

describe('a redirect away from the API', () => {
  const elsewhere = 'https://cdn.third-party.example/orders.json'

  function redirectingApi() {
    const seen: Seen[] = []
    server.use(
      http.get('*/api/orders', () => HttpResponse.redirect(elsewhere, 302)),
      http.get(elsewhere, ({ request }) => {
        seen.push({
          headers: Object.fromEntries(request.headers.entries()),
          credentials: request.credentials,
        })
        return HttpResponse.json({ ok: true })
      }),
    )
    return seen
  }

  it('is refused, and reaches nobody, when the project says the API never redirects', async () => {
    configure({ headers: { 'X-Api-Key': 'gateway-secret' }, redirect: 'error' })
    signIn('bearer')
    const seen = redirectingApi()

    const error = await failureOf(apiGet('/orders'))

    expect(error.kind).toBe('network')
    expect(seen).toHaveLength(0)
  })

  it('is followed by default, as fetch does', async () => {
    configure({ headers: { 'X-Api-Key': 'gateway-secret' } })
    signIn('bearer')
    const seen = redirectingApi()

    expect(await apiGet('/orders')).toEqual({ ok: true })
    expect(seen).toHaveLength(1)
  })

  it('leaves a call’s own redirect mode alone', async () => {
    configure({ redirect: 'error' })
    signIn('bearer')
    const seen = redirectingApi()

    expect(await apiGet('/orders', { redirect: 'follow' })).toEqual({ ok: true })
    expect(seen).toHaveLength(1)
  })

  it('does not apply the setting to a request that is not for the API', async () => {
    configure({ redirect: 'error' })
    signIn('bearer')
    server.use(
      http.get(THIRD_PARTY, () => HttpResponse.redirect(elsewhere, 302)),
      http.get(elsewhere, () => HttpResponse.json({ ok: true })),
    )

    expect(await apiGet(THIRD_PARTY)).toEqual({ ok: true })
  })
})

describe('the deadline', () => {
  const never = () => new Promise<void>(() => {})

  /** Settle within `ms`, or say that it is still pending. */
  function settledWithin<T>(request: Promise<T>, ms: number): Promise<T | 'still pending'> {
    return Promise.race([request, delay(ms).then(() => 'still pending' as const)])
  }

  it('covers a request hook that never settles', async () => {
    configure({ timeoutMs: 100, request: never })
    signIn('bearer')
    const seen = record('*/api/orders', 'get')

    const outcome = await settledWithin(failureOf(apiGet('/orders')), 1_500)

    expect(outcome).not.toBe('still pending')
    expect(outcome).toMatchObject({
      code: 'TIMEOUT',
      kind: 'timeout',
      retryable: true,
      messageKey: 'errors.timeout',
    })
    expect(seen).toHaveLength(0)
  })

  it('covers it for a cancellable request too, whose deadline is not ofetch’s', async () => {
    configure({ timeoutMs: 100, request: never })
    signIn('bearer')
    record('*/api/orders', 'get')

    const outcome = await settledWithin(
      failureOf(apiGet('/orders', { signal: new AbortController().signal })),
      1_500,
    )

    expect(outcome).toMatchObject({ code: 'TIMEOUT', kind: 'timeout' })
  })

  it('lets the caller cancel a request that is waiting on a hook', async () => {
    configure({ request: never })
    signIn('bearer')
    record('*/api/orders', 'get')
    const controller = new AbortController()

    const pending = failureOf(apiGet('/orders', { signal: controller.signal }))
    setTimeout(() => controller.abort(), 20)
    const outcome = await settledWithin(pending, 1_500)

    expect(outcome).toMatchObject({ code: 'ABORTED', kind: 'aborted' })
  })

  it('is one deadline for the hooks and the network together', async () => {
    // Each fits in the deadline. Together they do not.
    configure({ timeoutMs: 400, request: () => delay(250) })
    signIn('bearer')
    server.use(
      http.get('*/api/orders', async () => {
        await delay(250)
        return HttpResponse.json({ ok: true })
      }),
    )

    expect(await failureOf(apiGet('/orders'))).toMatchObject({ code: 'TIMEOUT' })
  })

  it('leaves a request whose hooks are quick the whole of it', async () => {
    configure({ timeoutMs: 2_000, request: () => delay(20) })
    signIn('bearer')
    server.use(
      http.get('*/api/orders', async () => {
        await delay(50)
        return HttpResponse.json({ ok: true })
      }),
    )

    expect(await apiGet('/orders')).toEqual({ ok: true })
  })

  it('covers a CSRF prime function that never settles', async () => {
    configure({
      timeoutMs: 100,
      csrf: { source: 'cookie', name: 'csrftoken', header: 'X-CSRFToken', prime: never },
    })
    signIn('cookie')
    const seen = record('*/api/orders')

    const outcome = await settledWithin(failureOf(apiPost('/orders', { sku: 'A-1' })), 1_500)

    expect(outcome).toMatchObject({ code: 'TIMEOUT', kind: 'timeout' })
    expect(seen).toHaveLength(0)
  })

  it('covers one that hangs while a refused token is being renewed', async () => {
    let primes = 0
    configure({
      timeoutMs: 150,
      classify: ({ status }) => (status === 419 ? 'csrf' : null),
      csrf: {
        source: 'cookie',
        name: 'csrftoken',
        header: 'X-CSRFToken',
        prime: () => {
          primes++
          return never()
        },
      },
    })
    signIn('cookie')
    document.cookie = 'csrftoken=stale; path=/'
    let posts = 0
    server.use(
      http.post('*/api/orders', () => {
        posts++
        return new HttpResponse(null, { status: 419 })
      }),
    )

    const outcome = await settledWithin(failureOf(apiPost('/orders', { sku: 'A-1' })), 1_500)

    expect(outcome).toMatchObject({ code: 'TIMEOUT', kind: 'timeout' })
    expect(primes).toBe(1)
    expect(posts).toBe(1)
  })
})

describe('priming the CSRF token, across requests', () => {
  /** Laravel's prime endpoint, slow enough for requests to pile up behind it. */
  function sanctum(setCookie: boolean) {
    const state = { primes: 0, posts: [] as (string | null)[] }
    server.use(
      http.get('*/sanctum/csrf-cookie', async () => {
        state.primes++
        await delay(40)
        if (setCookie) document.cookie = 'XSRF-TOKEN=primed; path=/'
        return new HttpResponse(null, { status: 204 })
      }),
      http.post('*/api/orders', ({ request }) => {
        state.posts.push(request.headers.get('X-XSRF-TOKEN'))
        return HttpResponse.json({ ok: true })
      }),
    )
    return state
  }

  it('makes one prime request for three writes that find no token together', async () => {
    configure({ backend: presets.laravel })
    signIn('cookie')
    const backend = sanctum(true)

    await Promise.all([1, 2, 3].map((sku) => apiPost('/orders', { sku })))

    expect(backend.primes).toBe(1)
    expect(backend.posts).toEqual(['primed', 'primed', 'primed'])
  })

  it('does not prime again for every write when priming yields no token', async () => {
    configure({ backend: presets.laravel })
    signIn('cookie')
    // An HttpOnly cookie: the prime succeeds and JavaScript reads nothing.
    const backend = sanctum(false)

    await apiPost('/orders', { sku: 1 })
    await apiPost('/orders', { sku: 2 })
    await apiPost('/orders', { sku: 3 })

    expect(backend.primes).toBe(1)
    expect(backend.posts).toEqual([null, null, null])
  })
})
