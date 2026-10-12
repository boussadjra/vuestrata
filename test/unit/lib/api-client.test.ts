import { delay, http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { $Fetch } from 'ofetch'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import { apiFetch, apiGet, apiPost, installApiAuth } from '@/lib/api/client'
import { redactUrl } from '@/lib/api/failure'
import { AppError } from '@/lib/errors'

/**
 * The API client, driven end to end: a real ofetch instance, a real (patched)
 * `fetch`, and msw answering on the other side. Mocking `fetch` itself would
 * test the mock — every defect below lived in how ofetch's hooks, retries and
 * errors interact, which only the real thing exhibits.
 *
 * `test/setup.ts` gives every test a fresh api-runtime backend, so the refresh
 * cooldown and the in-flight refresh never leak from one test into the next.
 */

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

async function failureOf(request: Promise<unknown>): Promise<AppError> {
  const error = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(AppError)
  return error as AppError
}

/** Install an auth provider holding an access token the API will reject. */
function signIn({
  token = 'expired-token',
  refreshToken = 'refresh-1',
}: { token?: string; refreshToken?: string | null } = {}) {
  const session: { token: string | null; refreshToken: string | null } = { token, refreshToken }
  const onSessionExpired = vi.fn()
  installApiAuth({
    getToken: () => session.token,
    getRefreshToken: () => session.refreshToken,
    setAuth: (nextToken, nextRefreshToken) => {
      session.token = nextToken
      session.refreshToken = nextRefreshToken
    },
    clearAuth: () => {
      session.token = null
      session.refreshToken = null
    },
    onSessionExpired,
  })
  return { session, onSessionExpired }
}

/** A refresh endpoint that mints `fresh-token`, counting how often it is asked. */
function refreshEndpoint({ latency = 0 } = {}) {
  const refreshes = { count: 0 }
  server.use(
    http.post('*/api/auth/refresh', async () => {
      refreshes.count++
      if (latency) await delay(latency)
      return HttpResponse.json({ token: 'fresh-token', refreshToken: 'refresh-2', expiresIn: 3600 })
    }),
  )
  return refreshes
}

interface SeenRequest {
  authorization: string | null
  marker: string | null
  body: unknown
}

/** An endpoint that accepts only `fresh-token`, recording every request it sees. */
function protectedEndpoint(method: 'get' | 'post', path: string) {
  const seen: SeenRequest[] = []
  server.use(
    http[method](`*/api${path}`, async ({ request }) => {
      const authorization = request.headers.get('Authorization')
      seen.push({
        authorization,
        marker: request.headers.get('X-Marker'),
        body: method === 'post' ? await request.json() : undefined,
      })
      if (authorization !== 'Bearer fresh-token') {
        return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
      }
      return HttpResponse.json({ ok: true })
    }),
  )
  return seen
}

/** An endpoint that never answers, so only a deadline or an abort ends the request. */
function hangingEndpoint(path: string) {
  server.use(
    http.get(`*/api${path}`, async () => {
      await delay('infinite')
      return HttpResponse.json({})
    }),
  )
}

describe('the $Fetch surface', () => {
  it('stays callable, with raw, native and create', () => {
    // Compile-time half: code written against ofetch's $Fetch keeps compiling.
    const asOfetch: $Fetch = apiFetch

    expect(typeof asOfetch).toBe('function')
    expect(typeof apiFetch.raw).toBe('function')
    expect(typeof apiFetch.native).toBe('function')
    expect(typeof apiFetch.create).toBe('function')
  })

  it('returns the parsed body, and the response from raw', async () => {
    server.use(
      http.get('*/api/items', () =>
        HttpResponse.json([{ id: 1 }], { headers: { 'X-Total-Count': '1' } }),
      ),
    )

    expect(await apiFetch('/items')).toEqual([{ id: 1 }])

    const response = await apiFetch.raw('/items')
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Total-Count')).toBe('1')
    expect(response._data).toEqual([{ id: 1 }])
  })

  it('creates clients that keep the auth header and the error handling', async () => {
    signIn({ token: 'fresh-token' })
    server.use(
      http.get('*/api/v2/whoami', ({ request }) =>
        HttpResponse.json({ authorization: request.headers.get('Authorization') }),
      ),
      http.get('*/api/v2/missing', () => new HttpResponse(null, { status: 404 })),
    )
    const v2 = apiFetch.create({ baseURL: `${window.location.origin}/api/v2` })

    expect(await v2('/whoami')).toEqual({ authorization: 'Bearer fresh-token' })

    const error = await failureOf(v2('/missing'))
    expect(error).toMatchObject({ status: 404, kind: 'http', retryable: false })
  })

  it('normalizes the failures of raw too', async () => {
    server.use(http.get('*/api/missing', () => new HttpResponse(null, { status: 404 })))

    const error = await failureOf(apiFetch.raw('/missing'))

    expect(error).toMatchObject({
      status: 404,
      code: 'API_ERROR',
      kind: 'http',
      retryable: false,
      messageKey: 'errors.status_404',
      message: 'The requested resource was not found.',
    })
  })
})

describe('a 401 refreshes the session and replays the request', () => {
  it('replays a GET with the new token and returns the replay', async () => {
    const { session } = signIn()
    const refreshes = refreshEndpoint()
    const seen = protectedEndpoint('get', '/items')

    const result = await apiGet('/items', { headers: { 'X-Marker': 'kept' } })

    expect(result).toEqual({ ok: true })
    expect(refreshes.count).toBe(1)
    expect(seen.map((request) => request.authorization)).toEqual([
      'Bearer expired-token',
      'Bearer fresh-token',
    ])
    // The replay is the ORIGINAL request with new credentials, not a new one.
    expect(seen.map((request) => request.marker)).toEqual(['kept', 'kept'])
    expect(session.token).toBe('fresh-token')
  })

  // Mutations have no retry of their own. Before the replay existed, a user
  // whose token expired mid-form lost the save, and a TanStack retry could
  // never have rescued it.
  it('replays a POST, body included', async () => {
    signIn()
    const refreshes = refreshEndpoint()
    const seen = protectedEndpoint('post', '/orders')

    const result = await apiPost('/orders', { sku: 'SKU-1', quantity: 2 })

    expect(result).toEqual({ ok: true })
    expect(refreshes.count).toBe(1)
    expect(seen).toEqual([
      { authorization: 'Bearer expired-token', marker: null, body: { sku: 'SKU-1', quantity: 2 } },
      { authorization: 'Bearer fresh-token', marker: null, body: { sku: 'SKU-1', quantity: 2 } },
    ])
  })

  it('expires the session when the replay is refused too, and does not loop', async () => {
    const { onSessionExpired } = signIn()
    const refreshes = refreshEndpoint()
    let requests = 0
    server.use(
      http.get('*/api/items', () => {
        requests++
        return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
      }),
    )

    const error = await failureOf(apiGet('/items'))

    expect(error).toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
      kind: 'http',
      retryable: false,
      messageKey: 'errors.session_expired',
    })
    expect(requests).toBe(2)
    expect(refreshes.count).toBe(1)
    expect(onSessionExpired).toHaveBeenCalledOnce()
  })

  it('makes one refresh request for three concurrent 401s, then replays all three', async () => {
    signIn()
    // Slow enough that all three 401s arrive while the refresh is in flight.
    const refreshes = refreshEndpoint({ latency: 50 })
    const seen = protectedEndpoint('get', '/items')

    const results = await Promise.all([apiGet('/items'), apiGet('/items'), apiGet('/items')])

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }])
    expect(refreshes.count).toBe(1)
    expect(seen).toHaveLength(6)
    expect(seen.filter((request) => request.authorization === 'Bearer fresh-token')).toHaveLength(3)
  })

  it('expires the session at once when there is nothing to refresh with', async () => {
    const { onSessionExpired } = signIn({ refreshToken: null })
    const seen = protectedEndpoint('get', '/items')

    const error = await failureOf(apiGet('/items'))

    expect(error).toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
    expect(seen).toHaveLength(1)
    expect(onSessionExpired).toHaveBeenCalledOnce()
  })

  it('takes a 401 at face value under skipAuthRefresh', async () => {
    const { onSessionExpired } = signIn()
    const refreshes = refreshEndpoint()
    server.use(
      http.get('*/api/session/probe', () =>
        HttpResponse.json({ message: 'No session', code: 'NO_SESSION' }, { status: 401 }),
      ),
    )

    const error = await failureOf(apiGet('/session/probe', { skipAuthRefresh: true }))

    expect(error).toMatchObject({ status: 401, code: 'NO_SESSION', message: 'No session' })
    expect(refreshes.count).toBe(0)
    expect(onSessionExpired).not.toHaveBeenCalled()
  })

  // A 401 is how a login says "wrong password". Refreshing in response would
  // turn a typo into a signed-out session.
  it('leaves the auth endpoints alone', async () => {
    const { onSessionExpired } = signIn()
    const refreshes = refreshEndpoint()
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json(
          { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
          { status: 401 },
        ),
      ),
    )

    const error = await failureOf(apiPost('/auth/login', { email: 'a@b.test', password: 'x' }))

    expect(error).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' })
    expect(error.message).toBe('Invalid credentials')
    expect(refreshes.count).toBe(0)
    expect(onSessionExpired).not.toHaveBeenCalled()
  })
})

describe('an Authorization header the caller set', () => {
  it('is sent as it is, not replaced by the session token', async () => {
    signIn({ token: 'session-token' })
    server.use(
      http.get('*/api/whoami', ({ request }) =>
        HttpResponse.json({ authorization: request.headers.get('Authorization') }),
      ),
    )

    expect(await apiGet('/whoami', { headers: { Authorization: 'Bearer caller-token' } })).toEqual({
      authorization: 'Bearer caller-token',
    })
    expect(await apiGet('/whoami')).toEqual({ authorization: 'Bearer session-token' })
  })

  // A replay would send the session's token where the caller chose another
  // credential — possibly to a party that should never see it.
  it('is not refreshed or replayed over a 401', async () => {
    const { onSessionExpired } = signIn()
    const refreshes = refreshEndpoint()
    const seen = protectedEndpoint('get', '/items')

    const error = await failureOf(
      apiGet('/items', { headers: { Authorization: 'Bearer service-token' } }),
    )

    expect(error).toMatchObject({ status: 401, kind: 'http' })
    expect(seen.map((request) => request.authorization)).toEqual(['Bearer service-token'])
    expect(refreshes.count).toBe(0)
    expect(onSessionExpired).not.toHaveBeenCalled()
  })
})

describe('failures without a response', () => {
  it('reports a network failure as NETWORK_ERROR, without the URL', async () => {
    let requests = 0
    server.use(
      http.get('*/api/items', () => {
        requests++
        return HttpResponse.error()
      }),
    )

    const error = await failureOf(apiGet('/items?search=jane.doe%40example.test'))

    expect(error).toMatchObject({
      code: 'NETWORK_ERROR',
      kind: 'network',
      retryable: true,
      status: 0,
      messageKey: 'errors.network',
    })
    // ofetch's own message is `[GET] "http://…/api/items?search=…": <no
    // response> Failed to fetch` — the endpoint and the user's search, shown
    // to the user.
    expect(error.message).not.toMatch(/api\/items|localhost|search|jane/i)
    // One attempt: retrying is TanStack's job, not the client's.
    expect(requests).toBe(1)
  })

  it('reports a missed deadline as TIMEOUT', async () => {
    hangingEndpoint('/slow')

    const error = await failureOf(apiGet('/slow', { timeout: 20 }))

    expect(error).toMatchObject({ code: 'TIMEOUT', kind: 'timeout', retryable: true })
  })

  // ofetch arms its timeout only when the request has no signal, so the first
  // cancellable query would otherwise have hung for as long as the server did.
  it('keeps the deadline when the caller passes a signal', async () => {
    hangingEndpoint('/slow')

    const error = await failureOf(
      apiGet('/slow', { signal: new AbortController().signal, timeout: 20 }),
    )

    expect(error).toMatchObject({ code: 'TIMEOUT', kind: 'timeout' })
  })

  it('reports a cancelled request as ABORTED, which is not retried', async () => {
    hangingEndpoint('/slow')
    const controller = new AbortController()

    const pending = failureOf(apiGet('/slow', { signal: controller.signal }))
    controller.abort()
    const error = await pending

    expect(error).toMatchObject({ code: 'ABORTED', kind: 'aborted', retryable: false })
  })

  it('recognises an abort whatever reason the caller gave', async () => {
    hangingEndpoint('/slow')
    const controller = new AbortController()

    const pending = failureOf(apiGet('/slow', { signal: controller.signal }))
    controller.abort('the user navigated away')

    expect(await pending).toMatchObject({ code: 'ABORTED', kind: 'aborted' })
  })
})

describe('failures with a response', () => {
  it('makes exactly one request for a 503, and carries its Retry-After', async () => {
    let requests = 0
    server.use(
      http.get('*/api/busy', () => {
        requests++
        return HttpResponse.json(
          { message: 'pool exhausted on db-7.internal', code: 'DB_POOL' },
          { status: 503, headers: { 'Retry-After': '7' } },
        )
      }),
    )

    const error = await failureOf(apiGet('/busy'))

    expect(requests).toBe(1)
    expect(error).toMatchObject({
      status: 503,
      code: 'DB_POOL',
      kind: 'http',
      retryable: true,
      retryAfterMs: 7000,
      messageKey: 'errors.status_503',
    })
    // A server-class message never reaches the user: it names internals.
    expect(error.message).toBe('An unexpected error occurred. Please try again.')
  })

  it('keeps the message, code and field details of a client error', async () => {
    server.use(
      http.post('*/api/customers', () =>
        HttpResponse.json(
          {
            message: 'The email is already taken.',
            code: 'VALIDATION_FAILED',
            details: { email: ['Already taken'] },
            requestId: 'req-42',
          },
          { status: 422 },
        ),
      ),
    )

    const error = await failureOf(apiPost('/customers', { email: 'taken@example.test' }))

    expect(error).toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'The email is already taken.',
      details: { email: ['Already taken'] },
      requestId: 'req-42',
      kind: 'http',
      retryable: false,
    })
  })

  it('takes the request id from the response header when the body has none', async () => {
    server.use(
      http.get('*/api/broken', () =>
        HttpResponse.text('<html>Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html', 'X-Request-Id': 'edge-9' },
        }),
      ),
    )

    const error = await failureOf(apiGet('/broken'))

    expect(error).toMatchObject({ status: 502, code: 'API_ERROR', requestId: 'edge-9' })
    expect(error.message).not.toContain('html')
  })
})

// What the client logs for a failed request: enough to find the endpoint,
// nothing that identifies the user.
describe('redactUrl', () => {
  it.each([
    ['https://api.test/customers?search=jane#row-3', 'https://api.test/customers'],
    ['https://svc:hunter2@api.test/customers', 'https://api.test/customers'],
    ['/api/customers?page=2&search=jane', '/api/customers'],
    ['https://api.test/files/a@b.txt', 'https://api.test/files/a@b.txt'],
    ['https://api.test/customers', 'https://api.test/customers'],
  ])('%s → %s', (url, expected) => {
    expect(redactUrl(url)).toBe(expected)
  })
})
