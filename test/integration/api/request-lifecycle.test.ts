import { delay, http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import { installSeams } from '@/bootstrap/seams'
import { anonymousForbidden, loginRedirect, statusMeans } from '@/lib/api/classifiers'
import { apiFetch, apiGet, apiPost, installApiAuth } from '@/lib/api/client'
import { csrfPresets } from '@/lib/api/csrf'
import { problemJsonErrorMapper } from '@/lib/api/error-mappers'
import { resolveApiIntegration, type ApiOverrides } from '@/lib/api/integration'
import { presets } from '@/lib/api/presets'
import type { ApiAuthTransport, ApiRefreshResult } from '@/lib/api/types'
import { AppError } from '@/lib/errors'
import { __resetRuntimeSlots, installApiIntegration } from '@/lib/runtime'
import { getI18n } from '@/plugins/i18n'

import { resetRuntimeState } from '../../utils/reset-runtime-state'

/**
 * A request through the API client, from the overrides file to the wire and
 * back: a real ofetch instance, a real (patched) `fetch`, msw as the backend.
 *
 * Each test installs the integration a project's `api.overrides.ts` would
 * resolve to and asserts what the backend received, or what the caller got.
 * Nothing here mocks the client: the defects this seam exists to prevent (a
 * login page parsed as data, a 419 shown to the user, a hook that drops the
 * session's credentials) only exist in how the real pieces interact.
 */

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(async () => {
  server.resetHandlers()
  clearCookies()
  for (const tag of document.head.querySelectorAll('meta[name]')) tag.remove()
  getI18n().global.locale.value = 'en'
  // The integration slot is module state; put back what `test/setup.ts` installs.
  __resetRuntimeSlots()
  await resetRuntimeState()
})
afterAll(() => server.close())

function clearCookies() {
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
}

/** Install what `api.overrides.ts` would resolve to, without the app-layer hooks. */
function configure(overrides: ApiOverrides) {
  installApiIntegration(resolveApiIntegration(overrides))
}

async function failureOf(request: Promise<unknown>): Promise<AppError> {
  const error = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(AppError)
  return error as AppError
}

interface SignInOptions {
  token?: string | null
  refreshToken?: string | null
  transport?: ApiAuthTransport
  refresh?: () => Promise<ApiRefreshResult | null>
}

/** Install an auth provider, by default holding a token the API will reject. */
function signIn({
  token = 'expired-token',
  refreshToken = 'refresh-1',
  transport,
  refresh,
}: SignInOptions = {}) {
  const session = { token, refreshToken }
  const onSessionExpired = vi.fn()
  installApiAuth({
    transport,
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
    ...(refresh ? { refresh } : {}),
  })
  return { session, onSessionExpired }
}

/** A refresh endpoint that mints `fresh-token`, recording what each request carried. */
function refreshEndpoint() {
  const seen: Record<string, string>[] = []
  server.use(
    http.post('*/api/auth/refresh', ({ request }) => {
      seen.push(Object.fromEntries(request.headers.entries()))
      return HttpResponse.json({ token: 'fresh-token', refreshToken: 'refresh-2', expiresIn: 3600 })
    }),
  )
  return seen
}

/** Every header each request to `path` carried, lower-cased by `Headers`. */
function recordHeaders(
  method: 'get' | 'post' | 'delete',
  path: string,
  body: unknown = { ok: true },
) {
  const seen: Record<string, string>[] = []
  server.use(
    http[method](`*/api${path}`, ({ request }) => {
      seen.push(Object.fromEntries(request.headers.entries()))
      return HttpResponse.json(body as Record<string, unknown>)
    }),
  )
  return seen
}

describe('built-in headers', () => {
  it('sends Accept: application/json on a request without a body', async () => {
    const seen = recordHeaders('get', '/orders')

    await apiGet('/orders')

    // ofetch only added it to requests with a JSON body, so every GET went out
    // without one, and a backend answered as it would a browser.
    expect(seen[0]).toEqual({ accept: 'application/json' })
  })

  it('leaves an Accept the caller chose alone', async () => {
    const seen = recordHeaders('get', '/report')

    await apiGet('/report', { headers: { Accept: 'application/vnd.acme.v2+json' } })

    expect(seen[0]!.accept).toBe('application/vnd.acme.v2+json')
  })

  it('does not ask for JSON when the caller asked for something else', async () => {
    let accept: string | null = 'unset'
    server.use(
      http.get('*/api/export', ({ request }) => {
        accept = request.headers.get('accept')
        return HttpResponse.text('id,name\n1,Ada', { headers: { 'Content-Type': 'text/csv' } })
      }),
    )

    const csv = await apiFetch('/export', { responseType: 'text' })

    expect(csv).toBe('id,name\n1,Ada')
    expect(accept).toBeNull()
  })

  it('sends no Accept-Language until the bootstrap installs the hook', async () => {
    const seen = recordHeaders('get', '/orders')

    await apiGet('/orders')

    expect(seen[0]).not.toHaveProperty('accept-language')
  })

  it('sends the active locale once the seams are installed, and follows a switch', async () => {
    installSeams()
    const seen = recordHeaders('get', '/orders')

    await apiGet('/orders')
    getI18n().global.locale.value = 'ar'
    await apiGet('/orders')

    expect(seen.map((headers) => headers['accept-language'])).toEqual(['en', 'ar'])
  })

  it('leaves an Accept-Language the caller chose alone', async () => {
    installSeams()
    const seen = recordHeaders('get', '/orders')

    await apiGet('/orders', { headers: { 'Accept-Language': 'fr-CA' } })

    expect(seen[0]!['accept-language']).toBe('fr-CA')
  })
})

describe('request hooks', () => {
  it('adds a tenant header read at request time', async () => {
    const tenant = { current: 'acme' as string | null }
    configure({ headers: { 'X-Tenant': () => tenant.current } })
    const seen = recordHeaders('get', '/orders')

    await apiGet('/orders')
    tenant.current = 'globex'
    await apiGet('/orders')
    // Nothing selected: the header is left off, not sent empty.
    tenant.current = null
    await apiGet('/orders')

    expect(seen.map((headers) => headers['x-tenant'])).toEqual(['acme', 'globex', undefined])
  })

  it('leaves a header the call set itself as the call set it', async () => {
    configure({ headers: { 'X-Tenant': () => 'acme', 'X-Client': 'web' } })
    const seen = recordHeaders('get', '/orders')

    await apiGet('/orders', { headers: { 'X-Tenant': 'globex' } })

    // An admin screen acting for another tenant says so on the call.
    expect(seen[0]).toMatchObject({ 'x-tenant': 'globex', 'x-client': 'web' })
  })

  it('waits for an async hook before sending', async () => {
    configure({
      request: async ({ setHeader }) => {
        await delay(20)
        setHeader('X-Gateway-Key', 'fetched-key')
      },
    })
    const seen = recordHeaders('get', '/orders')

    await apiGet('/orders')

    expect(seen[0]!['x-gateway-key']).toBe('fetched-key')
  })

  it('gives a hook the method, the resolved URL without its query, and the headers so far', async () => {
    signIn({ token: 'session-token' })
    const contexts: { url: string; method: string; authorization: string | null }[] = []
    configure({
      request: ({ url, method, headers }) => {
        contexts.push({ url, method, authorization: headers.get('Authorization') })
      },
    })
    recordHeaders('post', '/orders')

    await apiPost('/orders', { sku: 'A-1' }, { query: { email: 'jane@example.test' } })

    expect(contexts).toEqual([
      {
        url: `${window.location.origin}/api/orders`,
        method: 'POST',
        authorization: 'Bearer session-token',
      },
    ])
  })

  it('fails the request as an AppError when a hook throws, and sends nothing', async () => {
    configure({
      request: () => {
        throw new TypeError("Cannot read properties of undefined (reading 'currentTenantId')")
      },
    })
    const seen = recordHeaders('get', '/orders')

    const error = await failureOf(apiGet('/orders'))

    expect(error).toMatchObject({
      code: 'REQUEST_HOOK_FAILED',
      kind: 'unknown',
      status: 0,
      retryable: false,
      messageKey: 'errors.unknown',
    })
    // The hook's own message is for the log, not for the user.
    expect(error.message).not.toContain('currentTenantId')
    expect(seen).toHaveLength(0)
  })

  it('fails the same way when an async hook rejects', async () => {
    configure({
      request: async () => {
        await delay(5)
        throw new Error('key service down')
      },
    })
    recordHeaders('get', '/orders')

    const error = await failureOf(apiGet('/orders'))

    expect(error.code).toBe('REQUEST_HOOK_FAILED')
  })

  it('lets a hook fail a request with an AppError of its own', async () => {
    const refusal = new AppError({
      message: 'Pick a workspace first.',
      code: 'NO_TENANT',
      status: 0,
    })
    configure({
      request: () => {
        throw refusal
      },
    })

    expect(await failureOf(apiGet('/orders'))).toBe(refusal)
  })

  it('cannot take away the session credentials the client applied', async () => {
    signIn({ token: 'session-token' })
    configure({
      request: ({ headers, setHeader }) => {
        headers.delete('Authorization')
        setHeader('Authorization', null)
        setHeader('X-Tenant', 'acme')
      },
    })
    const seen = recordHeaders('get', '/orders')

    await apiGet('/orders')

    expect(seen[0]).toMatchObject({ authorization: 'Bearer session-token', 'x-tenant': 'acme' })
  })

  it('cannot replace them either', async () => {
    signIn({ token: 'session-token' })
    configure({ headers: { Authorization: 'Bearer somebody-else' } })
    const seen = recordHeaders('get', '/orders')

    await apiGet('/orders')

    expect(seen[0]!.authorization).toBe('Bearer session-token')
  })

  it('cannot drop the CSRF header under the cookie transport', async () => {
    signIn({ transport: 'cookie', token: null })
    document.cookie = 'csrftoken=dj-token; path=/'
    configure({
      csrf: csrfPresets.django,
      request: ({ setHeader }) => setHeader('X-CSRFToken', null),
    })
    const seen = recordHeaders('post', '/orders')

    await apiPost('/orders', { sku: 'A-1' })

    expect(seen[0]!['x-csrftoken']).toBe('dj-token')
  })

  it('may add an Authorization header when the session supplied none', async () => {
    configure({ headers: { Authorization: 'Bearer public-anon-key' } })
    const seen = recordHeaders('get', '/public/plans')

    await apiGet('/public/plans')

    expect(seen[0]!.authorization).toBe('Bearer public-anon-key')
  })

  it('runs before the hooks a caller passes with the request', async () => {
    configure({ headers: { 'X-Tenant': 'acme' } })
    const seen = recordHeaders('get', '/orders')
    let tenantSeenByCaller: string | null = null

    await apiGet('/orders', {
      onRequest: ({ options }) => {
        tenantSeenByCaller = options.headers.get('X-Tenant')
      },
    })

    expect(tenantSeenByCaller).toBe('acme')
    expect(seen[0]!['x-tenant']).toBe('acme')
  })
})

describe('tracing', () => {
  it('sends no correlation header by default', async () => {
    const seen = recordHeaders('get', '/orders')

    await apiGet('/orders')

    expect(seen[0]).not.toHaveProperty('x-request-id')
    expect(seen[0]).not.toHaveProperty('traceparent')
  })

  it('sends a fresh X-Request-Id and traceparent per request when switched on', async () => {
    configure({ tracing: true })
    const seen = recordHeaders('get', '/orders')

    await apiGet('/orders')
    await apiGet('/orders')

    for (const headers of seen) {
      expect(headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
      expect(headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    }
    expect(seen[0]!['x-request-id']).not.toBe(seen[1]!['x-request-id'])
    expect(seen[0]!.traceparent).not.toBe(seen[1]!.traceparent)
  })

  it('sends only the one that was asked for', async () => {
    configure({ tracing: { requestId: true, requestIdHeader: 'X-Correlation-Id' } })
    const seen = recordHeaders('get', '/orders')

    await apiGet('/orders')

    expect(seen[0]!['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(seen[0]).not.toHaveProperty('x-request-id')
    expect(seen[0]).not.toHaveProperty('traceparent')
  })

  it('reports the id it sent on a failure the backend did not name', async () => {
    configure({ tracing: { requestId: true } })
    let sent: string | null = null
    server.use(
      http.get('*/api/orders', ({ request }) => {
        sent = request.headers.get('x-request-id')
        return HttpResponse.json({ message: 'Nope' }, { status: 409 })
      }),
    )

    const error = await failureOf(apiGet('/orders'))

    expect(sent).toMatch(/^[0-9a-f-]{36}$/)
    expect(error.requestId).toBe(sent)
  })

  it('reports it for a request that got no answer at all', async () => {
    configure({ tracing: { requestId: true } })
    let sent: string | null = null
    server.use(
      http.get('*/api/orders', ({ request }) => {
        sent = request.headers.get('x-request-id')
        return HttpResponse.error()
      }),
    )

    const error = await failureOf(apiGet('/orders'))

    expect(error).toMatchObject({ code: 'NETWORK_ERROR', requestId: sent })
    expect(sent).not.toBeNull()
  })

  it('prefers the id in the response header, which is the one the backend logged', async () => {
    configure({ tracing: { requestId: true } })
    server.use(
      http.get('*/api/orders', () =>
        HttpResponse.json(
          { message: 'Nope' },
          { status: 409, headers: { 'X-Request-Id': 'edge-7f3a' } },
        ),
      ),
    )

    expect((await failureOf(apiGet('/orders'))).requestId).toBe('edge-7f3a')
  })

  it('reads the response header with tracing off too', async () => {
    server.use(
      http.get('*/api/orders', () =>
        HttpResponse.json(
          { message: 'Nope' },
          { status: 409, headers: { 'X-Request-Id': 'edge-7f3a' } },
        ),
      ),
    )

    expect((await failureOf(apiGet('/orders'))).requestId).toBe('edge-7f3a')
  })

  it('keeps an id the caller set, and reports that one', async () => {
    configure({ tracing: { requestId: true } })
    server.use(http.get('*/api/orders', () => new HttpResponse(null, { status: 404 })))

    const error = await failureOf(
      apiGet('/orders', { headers: { 'X-Request-Id': 'from-the-caller' } }),
    )

    expect(error.requestId).toBe('from-the-caller')
  })
})

describe('a session that expired behind a redirect to the login page', () => {
  /** An endpoint that redirects to `/login` unless the request carries `fresh-token`. */
  function redirectingEndpoint(path: string) {
    const seen: (string | null)[] = []
    server.use(
      http.get(`*/api${path}`, ({ request }) => {
        const authorization = request.headers.get('Authorization')
        seen.push(authorization)
        if (authorization === 'Bearer fresh-token') return HttpResponse.json({ ok: true })
        return new HttpResponse(null, {
          status: 302,
          headers: { Location: `${window.location.origin}/login?next=%2Forders` },
        })
      }),
      http.get('*/login', () =>
        HttpResponse.html('<!doctype html><title>Sign in</title><form method="post"></form>'),
      ),
    )
    return seen
  }

  it('is refreshed and replayed, like a 401', async () => {
    configure({ classify: loginRedirect() })
    const { session } = signIn()
    const refreshes = refreshEndpoint()
    const seen = redirectingEndpoint('/orders')

    const result = await apiGet('/orders')

    expect(result).toEqual({ ok: true })
    expect(refreshes).toHaveLength(1)
    expect(seen).toEqual(['Bearer expired-token', 'Bearer fresh-token'])
    expect(session.token).toBe('fresh-token')
  })

  it('ends the session when there is nothing to refresh with', async () => {
    configure({ backend: presets.laravel })
    const { onSessionExpired } = signIn({ refreshToken: null })
    redirectingEndpoint('/orders')

    const error = await failureOf(apiGet('/orders'))

    expect(error).toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
      messageKey: 'errors.session_expired',
    })
    expect(onSessionExpired).toHaveBeenCalledOnce()
  })

  it('fails as a 401 for a request that must not be refreshed, such as a session probe', async () => {
    configure({ classify: loginRedirect() })
    const { onSessionExpired } = signIn()
    const refreshes = refreshEndpoint()
    redirectingEndpoint('/session')

    const error = await failureOf(apiGet('/session', { skipAuthRefresh: true }))

    // Not a page of HTML handed to the adapter as if it were the user.
    expect(error).toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
      kind: 'http',
      messageKey: 'errors.status_401',
    })
    expect(refreshes).toHaveLength(0)
    expect(onSessionExpired).not.toHaveBeenCalled()
  })

  it('without the classifier, is at least an explicit error and not a page of HTML', async () => {
    signIn()
    redirectingEndpoint('/orders')

    const error = await failureOf(apiGet('/orders'))

    expect(error).toMatchObject({ code: 'UNEXPECTED_RESPONSE', kind: 'contract' })
  })
})

describe('a 419 from Laravel', () => {
  /** Laravel's CSRF check: 419 unless the header carries the current token. */
  function laravelBackend() {
    const state = { token: 'token-2', primes: 0, posts: [] as (string | null)[] }
    server.use(
      http.get('*/sanctum/csrf-cookie', ({ request }) => {
        state.primes++
        expect(request.credentials).toBe('include')
        // The Set-Cookie a browser would store. Laravel percent-encodes it.
        document.cookie = `XSRF-TOKEN=${encodeURIComponent(`${state.token}=`)}; path=/`
        return new HttpResponse(null, { status: 204 })
      }),
      http.post('*/api/orders', ({ request }) => {
        const sent = request.headers.get('X-XSRF-TOKEN')
        state.posts.push(sent)
        if (sent !== `${state.token}=`) {
          return HttpResponse.json({ message: 'CSRF token mismatch.' }, { status: 419 })
        }
        return HttpResponse.json({ id: 'ORD-1' }, { status: 201 })
      }),
    )
    return state
  }

  it('fetches a new token and replays the request once', async () => {
    configure({ backend: presets.laravel })
    signIn({ transport: 'cookie', token: null })
    document.cookie = `XSRF-TOKEN=${encodeURIComponent('token-1=')}; path=/`
    const backend = laravelBackend()

    const result = await apiPost('/orders', { sku: 'A-1' })

    expect(result).toEqual({ id: 'ORD-1' })
    expect(backend.primes).toBe(1)
    // The stale token, decoded; then the primed one.
    expect(backend.posts).toEqual(['token-1=', 'token-2='])
  })

  it('primes before the first write when the visitor has no token yet', async () => {
    configure({ backend: presets.laravel })
    signIn({ transport: 'cookie', token: null })
    const backend = laravelBackend()

    await apiPost('/orders', { sku: 'A-1' })

    expect(backend.primes).toBe(1)
    expect(backend.posts).toEqual(['token-2='])
  })

  it('does not loop when the new token is refused too', async () => {
    configure({ backend: presets.laravel })
    signIn({ transport: 'cookie', token: null })
    document.cookie = 'XSRF-TOKEN=token-1; path=/'
    let posts = 0
    let primes = 0
    server.use(
      http.get('*/sanctum/csrf-cookie', () => {
        primes++
        return new HttpResponse(null, { status: 204 })
      }),
      http.post('*/api/orders', () => {
        posts++
        return HttpResponse.json({ message: 'CSRF token mismatch.' }, { status: 419 })
      }),
    )

    const error = await failureOf(apiPost('/orders', { sku: 'A-1' }))

    expect(posts).toBe(2)
    expect(primes).toBe(1)
    expect(error).toMatchObject({
      status: 419,
      code: 'CSRF_TOKEN_MISMATCH',
      kind: 'http',
      retryable: false,
      messageKey: 'errors.csrf',
    })
    // The client's own wording: "CSRF token mismatch." tells a user nothing.
    expect(error.message).not.toContain('mismatch')
    expect(error.serverMessage).toBeUndefined()
  })

  it('still replays when the strategy has no prime step, re-reading the token', async () => {
    configure({ classify: statusMeans(419, 'csrf'), csrf: csrfPresets.spring })
    signIn({ transport: 'cookie', token: null })
    document.cookie = 'XSRF-TOKEN=old; path=/'
    const sent: (string | null)[] = []
    server.use(
      http.post('*/api/orders', ({ request }) => {
        const token = request.headers.get('X-XSRF-TOKEN')
        sent.push(token)
        if (token === 'new') return HttpResponse.json({ id: 'ORD-1' })
        // The response that refuses the token also rotates it.
        document.cookie = 'XSRF-TOKEN=new; path=/'
        return new HttpResponse(null, { status: 419 })
      }),
    )

    expect(await apiPost('/orders', { sku: 'A-1' })).toEqual({ id: 'ORD-1' })
    expect(sent).toEqual(['old', 'new'])
  })

  it('does not replay under the bearer transport, where no token is sent', async () => {
    configure({ backend: presets.laravel })
    signIn({ token: 'session-token' })
    let posts = 0
    server.use(
      http.post('*/api/orders', () => {
        posts++
        return HttpResponse.json({ message: 'CSRF token mismatch.' }, { status: 419 })
      }),
    )

    const error = await failureOf(apiPost('/orders', { sku: 'A-1' }))

    expect(posts).toBe(1)
    expect(error).toMatchObject({ status: 419, messageKey: 'errors.csrf' })
  })

  it('sends no CSRF header under the bearer transport, whatever the strategy', async () => {
    configure({ backend: presets.laravel })
    signIn({ token: 'session-token' })
    document.cookie = 'XSRF-TOKEN=token-1; path=/'
    const seen = recordHeaders('post', '/orders')

    await apiPost('/orders', { sku: 'A-1' })

    expect(seen[0]).not.toHaveProperty('x-xsrf-token')
    expect(seen[0]!.authorization).toBe('Bearer session-token')
  })
})

describe('the default CSRF strategy', () => {
  it('still sends the meta tag token as X-CSRF-Token under the cookie transport', async () => {
    signIn({ transport: 'cookie', token: null })
    const tag = document.createElement('meta')
    tag.setAttribute('name', 'csrf-token')
    tag.setAttribute('content', 'meta-token')
    document.head.append(tag)
    const seen = recordHeaders('post', '/orders')

    await apiPost('/orders', { sku: 'A-1' })

    expect(seen[0]!['x-csrf-token']).toBe('meta-token')
  })

  it('sends none when the strategy is switched off', async () => {
    configure({ csrf: { source: 'none' } })
    signIn({ transport: 'cookie', token: null })
    const tag = document.createElement('meta')
    tag.setAttribute('name', 'csrf-token')
    tag.setAttribute('content', 'meta-token')
    document.head.append(tag)
    const seen = recordHeaders('post', '/orders')

    await apiPost('/orders', { sku: 'A-1' })

    expect(seen[0]).not.toHaveProperty('x-csrf-token')
  })
})

describe('the token refresh request', () => {
  it('carries the CSRF token of the configured strategy', async () => {
    configure({ csrf: csrfPresets.django })
    signIn({ transport: 'cookie' })
    document.cookie = 'csrftoken=dj-token; path=/'
    const refreshes = refreshEndpoint()
    let calls = 0
    server.use(
      http.get('*/api/orders', () => {
        calls++
        return calls === 1
          ? HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
          : HttpResponse.json({ ok: true })
      }),
    )

    await apiGet('/orders')

    expect(refreshes).toHaveLength(1)
    expect(refreshes[0]!['x-csrftoken']).toBe('dj-token')
    expect(refreshes[0]).not.toHaveProperty('x-csrf-token')
  })

  it('carries none under the bearer transport', async () => {
    configure({ csrf: csrfPresets.django })
    signIn()
    document.cookie = 'csrftoken=dj-token; path=/'
    const refreshes = refreshEndpoint()
    let calls = 0
    server.use(
      http.get('*/api/orders', () => {
        calls++
        return calls === 1
          ? HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
          : HttpResponse.json({ ok: true })
      }),
    )

    await apiGet('/orders')

    expect(refreshes[0]).not.toHaveProperty('x-csrftoken')
  })
})

describe("DRF's anonymous 403", () => {
  it('ends the session instead of reporting a missing permission', async () => {
    configure({ backend: presets.django })
    const { onSessionExpired } = signIn({ transport: 'cookie', token: null, refreshToken: null })
    server.use(
      http.get('*/api/orders', () =>
        HttpResponse.json(
          { detail: 'Authentication credentials were not provided.' },
          { status: 403 },
        ),
      ),
    )

    const error = await failureOf(apiGet('/orders'))

    expect(error).toMatchObject({ status: 401, messageKey: 'errors.session_expired' })
    expect(onSessionExpired).toHaveBeenCalledOnce()
  })

  it('leaves a real permission error a 403, and the session alone', async () => {
    configure({ backend: presets.django })
    const { onSessionExpired } = signIn({ transport: 'cookie', token: null, refreshToken: null })
    server.use(
      http.get('*/api/orders', () =>
        HttpResponse.json(
          { detail: 'You do not have permission to perform this action.' },
          { status: 403 },
        ),
      ),
    )

    const error = await failureOf(apiGet('/orders'))

    expect(error).toMatchObject({
      status: 403,
      message: 'You do not have permission to perform this action.',
      messageKey: 'errors.status_403',
    })
    expect(onSessionExpired).not.toHaveBeenCalled()
  })

  it('reports a session probe as a 401, without refreshing', async () => {
    configure({ classify: anonymousForbidden() })
    const { onSessionExpired } = signIn()
    const refreshes = refreshEndpoint()
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(
          { detail: 'Authentication credentials were not provided.' },
          { status: 403 },
        ),
      ),
    )

    const error = await failureOf(apiGet('/auth/me', { skipAuthRefresh: true }))

    expect(error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    expect(refreshes).toHaveLength(0)
    expect(onSessionExpired).not.toHaveBeenCalled()
  })
})

describe('classifiers', () => {
  it('lets a project stop a 401 that means "not allowed" from refreshing the session', async () => {
    configure({
      classify: ({ status, body }) =>
        status === 401 && (body as { code?: string } | null)?.code === 'insufficient_scope'
          ? 'forbidden'
          : null,
    })
    const { onSessionExpired } = signIn()
    const refreshes = refreshEndpoint()
    let requests = 0
    server.use(
      http.get('*/api/admin', () => {
        requests++
        return HttpResponse.json({ code: 'insufficient_scope' }, { status: 401 })
      }),
    )

    const error = await failureOf(apiGet('/admin'))

    expect(requests).toBe(1)
    expect(refreshes).toHaveLength(0)
    expect(onSessionExpired).not.toHaveBeenCalled()
    expect(error).toMatchObject({
      status: 401,
      code: 'insufficient_scope',
      messageKey: 'errors.status_403',
    })
  })

  it('skips a classifier that throws, and still reads the response', async () => {
    configure({
      classify: () => {
        throw new Error('bug in the project classifier')
      },
    })
    signIn()
    const refreshes = refreshEndpoint()
    let calls = 0
    server.use(
      http.get('*/api/orders', () => {
        calls++
        return calls === 1
          ? HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
          : HttpResponse.json({ ok: true })
      }),
    )

    // The built-in 401 classifier still ran.
    expect(await apiGet('/orders')).toEqual({ ok: true })
    expect(refreshes).toHaveLength(1)
  })
})

describe('error mapping', () => {
  it('reads a problem+json 422 into message, details and request id', async () => {
    configure({ errors: problemJsonErrorMapper })
    server.use(
      http.post('*/api/customers', () =>
        HttpResponse.json(
          {
            type: 'https://tools.ietf.org/html/rfc9110#section-15.5.21',
            title: 'One or more validation errors occurred.',
            status: 422,
            errors: {
              Email: ['The Email field is not a valid e-mail address.'],
              'Address.City': ['The City field is required.'],
            },
            traceId: '00-84c1fd40-85d1d4-00',
          },
          { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )

    const error = await failureOf(apiPost('/customers', { email: 'nope' }))

    expect(error).toMatchObject({
      status: 422,
      kind: 'http',
      retryable: false,
      messageKey: 'errors.status_422',
      message: 'One or more validation errors occurred.',
      serverMessage: 'One or more validation errors occurred.',
      details: {
        Email: ['The Email field is not a valid e-mail address.'],
        'Address.City': ['The City field is required.'],
      },
      requestId: '00-84c1fd40-85d1d4-00',
    })
  })

  it('falls through to the Vuestrata mapper for a body the project mapper does not know', async () => {
    configure({ errors: problemJsonErrorMapper })
    server.use(
      http.post('*/api/customers', () =>
        HttpResponse.json(
          { message: 'Email taken.', code: 'DUPLICATE', details: { email: ['Taken'] } },
          { status: 409 },
        ),
      ),
    )

    const error = await failureOf(apiPost('/customers', { email: 'a@b.test' }))

    expect(error).toMatchObject({
      status: 409,
      code: 'DUPLICATE',
      message: 'Email taken.',
      details: { email: ['Taken'] },
    })
  })

  it('never shows the body of a 5xx, whatever the mapper read', async () => {
    configure({ backend: presets.spring })
    server.use(
      http.get('*/api/orders', () =>
        HttpResponse.json(
          {
            timestamp: '2026-03-04T10:15:30.123+00:00',
            status: 500,
            error: 'Internal Server Error',
            message: 'could not extract ResultSet; SQL [select * from orders_2026]',
            errors: [{ defaultMessage: 'JDBC connection refused at db-7.internal:5432' }],
            path: '/api/orders',
          },
          { status: 500 },
        ),
      ),
    )

    const error = await failureOf(apiGet('/orders'))

    expect(error.message).toBe('An unexpected error occurred. Please try again.')
    expect(error.serverMessage).toBeUndefined()
    expect(error.formErrors).toBeUndefined()
    expect(JSON.stringify([error.message, error.details, error.code])).not.toMatch(/ResultSet|db-7/)
    expect(error).toMatchObject({ status: 500, kind: 'http', retryable: true })
  })

  it('skips a mapper that throws', async () => {
    configure({
      errors: () => {
        throw new Error('bug in the project mapper')
      },
    })
    server.use(
      http.get('*/api/orders', () => HttpResponse.json({ message: 'Nope' }, { status: 409 })),
    )

    expect(await failureOf(apiGet('/orders'))).toMatchObject({ status: 409, message: 'Nope' })
  })
})

describe('a success that is not JSON', () => {
  it('is an UNEXPECTED_RESPONSE, not a string handed to a schema', async () => {
    // A static host's SPA fallback answering an API URL with index.html.
    server.use(
      http.get('*/api/customers', () =>
        HttpResponse.html('<!doctype html><div id="app"></div>', {
          headers: { 'X-Request-Id': 'edge-1' },
        }),
      ),
    )

    const error = await failureOf(apiGet('/customers'))

    expect(error).toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      kind: 'contract',
      retryable: false,
      messageKey: 'errors.unexpected_response',
      message: 'The server sent a response this app could not read.',
      requestId: 'edge-1',
    })
    expect(error.message).not.toContain('html')
  })

  it('leaves a request that asked for text or a blob alone', async () => {
    server.use(
      http.get('*/api/export', () =>
        HttpResponse.text('id,name\n1,Ada', { headers: { 'Content-Type': 'text/csv' } }),
      ),
    )

    expect(await apiFetch('/export', { responseType: 'text' })).toBe('id,name\n1,Ada')
    expect(await apiFetch('/export', { headers: { Accept: 'text/csv' } })).toBe('id,name\n1,Ada')
  })

  it('leaves an empty success alone, whatever it calls itself', async () => {
    server.use(
      http.delete('*/api/customers/1', () => new HttpResponse(null, { status: 204 })),
      http.post('*/api/customers', () =>
        HttpResponse.text('', { status: 201, headers: { 'Content-Type': 'text/plain' } }),
      ),
    )

    await expect(apiFetch('/customers/1', { method: 'DELETE' })).resolves.toBeUndefined()
    await expect(apiPost('/customers', { company: 'Acme' })).resolves.toBe('')
  })

  it('accepts every JSON media type', async () => {
    server.use(
      http.get('*/api/customers', () =>
        HttpResponse.text('{"ok":true}', {
          headers: { 'Content-Type': 'application/vnd.api+json; charset=utf-8' },
        }),
      ),
    )

    expect(await apiGet('/customers')).toEqual({ ok: true })
  })
})

describe('the timeout', () => {
  it('comes from the integration', async () => {
    configure({ timeoutMs: 40 })
    server.use(
      http.get('*/api/slow', async () => {
        await delay(400)
        return HttpResponse.json({})
      }),
    )

    expect(await failureOf(apiGet('/slow'))).toMatchObject({ code: 'TIMEOUT', kind: 'timeout' })
  })

  it('is still the caller’s to override per request', async () => {
    configure({ timeoutMs: 40 })
    server.use(
      http.get('*/api/slow', async () => {
        await delay(120)
        return HttpResponse.json({ ok: true })
      }),
    )

    expect(await apiGet('/slow', { timeout: 2_000 })).toEqual({ ok: true })
  })
})
