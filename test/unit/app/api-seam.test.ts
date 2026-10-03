import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test'

import { installSeams } from '@/bootstrap/seams'
import apiOverrides from '@/config/api.overrides'
import { apiFetch, apiGet, apiPost, installApiAuth } from '@/lib/api/client'
import { DEFAULT_API_INTEGRATION } from '@/lib/api/integration'
import { AppError } from '@/lib/errors'
import { __resetRuntimeSlots, tryGetApiIntegration } from '@/lib/runtime'

import { resetRuntimeState } from '../../utils/reset-runtime-state'

/**
 * `app/config/api.overrides.ts` as it ships: empty.
 *
 * A project that never opens the file must get the client it had before the
 * seam existed. Two headers are the documented exceptions, `Accept` and
 * `Accept-Language`, and this file is where "nothing else" is held to: the
 * header set of every kind of request is asserted in full, not by sample, and
 * every kind of failure is compared field by field against the client with no
 * integration installed at all.
 */

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(async () => {
  server.resetHandlers()
  __resetRuntimeSlots()
  await resetRuntimeState()
})
afterAll(() => server.close())

function signIn(transport?: 'bearer' | 'cookie') {
  installApiAuth({
    transport,
    getToken: () => 'session-token',
    getRefreshToken: () => null,
    setAuth: () => undefined,
    clearAuth: () => undefined,
  })
}

async function failureOf(request: Promise<unknown>): Promise<AppError> {
  const error = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(AppError)
  return error as AppError
}

/** Every field of an `AppError`, so two of them can be compared whole. */
function fieldsOf(error: AppError) {
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    status: error.status,
    details: error.details,
    requestId: error.requestId,
    kind: error.kind,
    retryable: error.retryable,
    retryAfterMs: error.retryAfterMs,
    messageKey: error.messageKey,
    formErrors: error.formErrors,
    serverMessage: error.serverMessage,
  }
}

describe('the shipped api.overrides.ts', () => {
  it('is empty', () => {
    expect(apiOverrides).toEqual({})
  })

  it('resolves to the defaults, plus the one hook the app layer contributes', () => {
    installSeams()
    const installed = tryGetApiIntegration()

    expect(installed).not.toBeNull()
    expect(installed).toEqual({
      ...DEFAULT_API_INTEGRATION,
      requestHooks: [expect.any(Function)],
    })
  })
})

describe('request headers with the shipped overrides', () => {
  /** The full header set each request carried. */
  function record() {
    const seen: Record<string, Record<string, string>> = {}
    const note =
      (name: string) =>
      ({ request }: { request: Request }) => {
        seen[name] = Object.fromEntries(request.headers.entries())
        return HttpResponse.json({ ok: true })
      }
    server.use(
      http.get('*/api/orders', note('GET')),
      http.post('*/api/orders', note('POST')),
      http.delete('*/api/orders/1', note('DELETE')),
      http.post('*/api/auth/login', note('login')),
      http.get('*/api/files/1', note('blob')),
    )
    return seen
  }

  async function sendAll() {
    await apiGet('/orders')
    await apiPost('/orders', { sku: 'A-1' })
    await apiFetch('/orders/1', { method: 'DELETE' })
    await apiPost('/auth/login', { email: 'a@b.test', password: 'x' }, { skipAuthRefresh: true })
    await apiFetch('/files/1', { responseType: 'blob' })
  }

  it('are what the client sent before, plus Accept and Accept-Language', async () => {
    signIn()
    installSeams()
    const seen = record()

    await sendAll()

    const session = { authorization: 'Bearer session-token' }
    expect(seen).toEqual({
      // Before the seam: authorization only.
      GET: { ...session, accept: 'application/json', 'accept-language': 'en' },
      // Before: authorization, and the accept and content-type ofetch gives a JSON body.
      POST: {
        ...session,
        accept: 'application/json',
        'content-type': 'application/json',
        'accept-language': 'en',
      },
      DELETE: { ...session, accept: 'application/json', 'accept-language': 'en' },
      login: {
        ...session,
        accept: 'application/json',
        'content-type': 'application/json',
        'accept-language': 'en',
      },
      // A request for a blob is not asked for JSON.
      blob: { ...session, 'accept-language': 'en' },
    })
  })

  it('add nothing else under the cookie transport either', async () => {
    signIn('cookie')
    installSeams()
    const seen = record()

    await sendAll()

    // No Authorization, and no CSRF header: this document has no meta tag.
    expect(seen.GET).toEqual({ accept: 'application/json', 'accept-language': 'en' })
    expect(seen.POST).toEqual({
      accept: 'application/json',
      'content-type': 'application/json',
      'accept-language': 'en',
    })
  })
})

describe('errors with the shipped overrides', () => {
  const failures: Record<string, () => Promise<unknown>> = {
    'a 404 with no body': () => apiGet('/missing'),
    'a 422 in the Vuestrata shape': () => apiPost('/customers', { email: 'taken@example.test' }),
    'a 409 with only a message': () => apiPost('/conflict', {}),
    'a 503 with Retry-After': () => apiGet('/busy'),
    'a 502 that is an HTML page': () => apiGet('/broken'),
    'a 401 on an auth endpoint': () => apiPost('/auth/login', { email: 'a@b.test' }),
    'a 401 with nothing to refresh': () => apiGet('/private'),
    'a 403': () => apiGet('/forbidden'),
    'a 419': () => apiPost('/expired', {}),
    'a network failure': () => apiGet('/down'),
  }

  function backend() {
    server.use(
      http.get('*/api/missing', () => new HttpResponse(null, { status: 404 })),
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
      http.post('*/api/conflict', () => HttpResponse.json({ message: 'Stale.' }, { status: 409 })),
      http.get('*/api/busy', () =>
        HttpResponse.json(
          { message: 'pool exhausted on db-7.internal', code: 'DB_POOL', details: { a: ['b'] } },
          { status: 503, headers: { 'Retry-After': '7' } },
        ),
      ),
      http.get('*/api/broken', () =>
        HttpResponse.text('<html>Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html', 'X-Request-Id': 'edge-9' },
        }),
      ),
      http.post('*/api/auth/login', () =>
        HttpResponse.json(
          { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
          { status: 401 },
        ),
      ),
      http.get('*/api/private', () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
      http.get('*/api/forbidden', () =>
        HttpResponse.json({ message: 'Not yours.' }, { status: 403 }),
      ),
      http.post('*/api/expired', () =>
        HttpResponse.json({ message: 'CSRF token mismatch.' }, { status: 419 }),
      ),
      http.get('*/api/down', () => HttpResponse.error()),
    )
  }

  it.each(Object.keys(failures))('%s is the same error with or without the seam', async (name) => {
    backend()
    signIn()
    const withoutSeam = fieldsOf(await failureOf(failures[name]!()))

    __resetRuntimeSlots()
    await resetRuntimeState()
    signIn()
    installSeams()
    const withSeam = fieldsOf(await failureOf(failures[name]!()))

    expect(withSeam).toEqual(withoutSeam)
  })

  it('are the errors the client produced before the seam existed, less the details of a 5xx', async () => {
    backend()
    signIn()
    installSeams()

    const produced: Record<string, Partial<ReturnType<typeof fieldsOf>>> = {}
    for (const [name, request] of Object.entries(failures)) {
      const {
        name: _name,
        serverMessage: _serverMessage,
        ...fields
      } = fieldsOf(await failureOf(request()))
      // `undefined` fields are dropped so the table below reads as the error does.
      produced[name] = JSON.parse(JSON.stringify(fields)) as typeof fields
    }

    expect(produced).toEqual({
      'a 404 with no body': {
        message: 'The requested resource was not found.',
        code: 'API_ERROR',
        status: 404,
        kind: 'http',
        retryable: false,
        messageKey: 'errors.status_404',
      },
      'a 422 in the Vuestrata shape': {
        message: 'The email is already taken.',
        code: 'VALIDATION_FAILED',
        status: 422,
        details: { email: ['Already taken'] },
        requestId: 'req-42',
        kind: 'http',
        retryable: false,
        messageKey: 'errors.status_422',
      },
      'a 409 with only a message': {
        message: 'Stale.',
        code: 'API_ERROR',
        status: 409,
        kind: 'http',
        retryable: false,
        messageKey: 'errors.status_409',
      },
      // The one field that is NOT as it was: the body's `details` used to be
      // carried on a 5xx, beside a message that never was. They are dropped
      // now, for every error format alike (see `httpError`).
      'a 503 with Retry-After': {
        message: 'An unexpected error occurred. Please try again.',
        code: 'DB_POOL',
        status: 503,
        kind: 'http',
        retryable: true,
        retryAfterMs: 7000,
        messageKey: 'errors.status_503',
      },
      'a 502 that is an HTML page': {
        message: 'An unexpected error occurred. Please try again.',
        code: 'API_ERROR',
        status: 502,
        requestId: 'edge-9',
        kind: 'http',
        retryable: true,
        messageKey: 'errors.status_502',
      },
      'a 401 on an auth endpoint': {
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
        status: 401,
        kind: 'http',
        retryable: false,
        messageKey: 'errors.status_401',
      },
      'a 401 with nothing to refresh': {
        message: 'Your session has expired. Please sign in again.',
        code: 'UNAUTHORIZED',
        status: 401,
        kind: 'http',
        retryable: false,
        messageKey: 'errors.session_expired',
      },
      'a 403': {
        message: 'Not yours.',
        code: 'API_ERROR',
        status: 403,
        kind: 'http',
        retryable: false,
        messageKey: 'errors.status_403',
      },
      // No preset, so a 419 is an ordinary client error.
      'a 419': {
        message: 'CSRF token mismatch.',
        code: 'API_ERROR',
        status: 419,
        kind: 'http',
        retryable: false,
        messageKey: 'errors.request',
      },
      'a network failure': {
        message: 'Network error — please check your connection and try again.',
        code: 'NETWORK_ERROR',
        status: 0,
        kind: 'network',
        retryable: true,
        messageKey: 'errors.network',
      },
    })
  })
})
