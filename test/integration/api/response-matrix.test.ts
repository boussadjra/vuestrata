import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { ofetch, type FetchResponse } from 'ofetch'
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

import { installSeams } from '@/bootstrap/seams'
import { apiFetch, apiGet, apiPost, installApiAuth } from '@/lib/api/client'
import { resolveApiIntegration, type ApiResponseContext } from '@/lib/api/integration'
import type { ApiAuthTransport } from '@/lib/api/types'
import { AppError } from '@/lib/errors'
import { __resetRuntimeSlots, installApiIntegration } from '@/lib/runtime'

import { resetRuntimeState } from '../../utils/reset-runtime-state'

/**
 * What the client makes of a response, held against bare ofetch.
 *
 * The API seam lets a project teach the client its backend's conventions. A
 * project that teaches it nothing (`api.overrides.ts` as shipped, empty) must
 * get from the client exactly what ofetch alone gives: the first cut of the
 * seam judged every 2xx by its `Content-Type`, and reported a delete that had
 * happened as failed because the backend answered `OK` in plain text.
 *
 * So the matrix below does not assert what the client returns. It sends each
 * response through bare ofetch as well and asserts the two agree, for every
 * method and every kind of success a backend is known to send.
 */

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(async () => {
  server.resetHandlers()
  __resetRuntimeSlots()
  await resetRuntimeState()
})
afterAll(() => server.close())

function signIn(transport: ApiAuthTransport = 'bearer') {
  const onSessionExpired = vi.fn()
  installApiAuth({
    transport,
    getToken: () => (transport === 'bearer' ? 'session-token' : null),
    getRefreshToken: () => 'refresh-1',
    setAuth: () => {},
    clearAuth: () => {},
    onSessionExpired,
  })
  return { onSessionExpired }
}

async function failureOf(request: Promise<unknown>): Promise<AppError> {
  const error = await request.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(AppError)
  return error as AppError
}

const JSON_TEXT = '{"id":"ORD-1","items":[1,2]}'

/** A body, and the `Content-Type` it is sent with (`null` for none at all). */
const BODIES: [name: string, body: string, contentType: string | null][] = [
  ['"OK" as text/plain', 'OK', 'text/plain'],
  ['a page as text/html', '<!doctype html><title>ok</title><p>ok</p>', 'text/html; charset=utf-8'],
  ['an empty body', '', 'text/plain'],
  ['whitespace', ' \n', 'text/plain'],
  ['application/json', JSON_TEXT, 'application/json'],
  ['application/problem+json', JSON_TEXT, 'application/problem+json'],
  ['application/vnd.api+json', JSON_TEXT, 'application/vnd.api+json; charset=utf-8'],
  ['application/hal+json', JSON_TEXT, 'application/hal+json'],
  ['JSON labelled text/json', JSON_TEXT, 'text/json'],
  ['JSON with no Content-Type', JSON_TEXT, null],
  ['text with no Content-Type', 'OK', null],
]

const SCENARIOS: [name: string, status: number, body: string | null, contentType: string | null][] =
  [
    ...[200, 201, 202].flatMap((status) =>
      BODIES.map(
        ([name, body, contentType]) =>
          [`${status} with ${name}`, status, body, contentType] as [
            string,
            number,
            string,
            string | null,
          ],
      ),
    ),
    ['204 with no body', 204, null, null],
  ]

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

/** Answer every method at `/api/matrix` with one response, and count the requests. */
function answerWith(status: number, body: string | null, contentType: string | null) {
  const requests = { count: 0 }
  server.use(
    http.all('*/api/matrix', () => {
      requests.count++
      if (body === null) return new HttpResponse(null, { status })
      // A string body is given `text/plain` by `Response` itself; bytes are
      // the way to send a body with no `Content-Type` at all.
      return contentType === null
        ? new HttpResponse(new TextEncoder().encode(body), { status })
        : new HttpResponse(body, { status, headers: { 'Content-Type': contentType } })
    }),
  )
  return requests
}

function optionsFor(method: (typeof METHODS)[number]) {
  const sendsBody = method === 'POST' || method === 'PUT' || method === 'PATCH'
  return { method, ...(sendsBody ? { body: { sku: 'A-1' } } : {}) }
}

type Outcome =
  | { resolved: true; status: number; data: unknown }
  | { resolved: false; error: string }

async function outcomeOf(run: () => Promise<FetchResponse<unknown>>): Promise<Outcome> {
  try {
    const response = await run()
    return { resolved: true, status: response.status, data: response._data }
  } catch (error) {
    return { resolved: false, error: error instanceof AppError ? error.code : String(error) }
  }
}

describe.each(['bearer', 'cookie'] as const)(
  'with an empty overrides file, under the %s transport',
  (transport) => {
    beforeEach(() => {
      signIn(transport)
      // The shipped `api.overrides.ts`, resolved and installed as `boot()` does.
      installSeams()
    })

    describe.each(METHODS)('%s', (method) => {
      it.each(SCENARIOS)('%s is what bare ofetch makes of it', async (_, status, body, type) => {
        const requests = answerWith(status, body, type)
        const options = optionsFor(method)

        const viaOfetch = await outcomeOf(() =>
          ofetch.raw(`${window.location.origin}/api/matrix`, { ...options, retry: 0 }),
        )
        const viaClient = await outcomeOf(() => apiFetch.raw('/matrix', options))

        // The baseline itself: a 2xx is a success, whatever it carries.
        expect(viaOfetch.resolved).toBe(true)
        expect(viaClient).toEqual(viaOfetch)
        // One request each: nothing was refreshed, primed or replayed.
        expect(requests.count).toBe(2)
      })
    })
  },
)

describe('expectJson: the one way a success becomes UNEXPECTED_RESPONSE', () => {
  beforeEach(() => {
    signIn()
    installSeams()
  })

  it.each([
    ['a web page', '<!doctype html><div id="app"></div>', 'text/html'],
    ['a line of text', 'OK', 'text/plain'],
    ['a file', 'id,name\n1,Ada', 'application/octet-stream'],
    ['text that claims to be JSON under a text type', 'not json', 'text/json'],
  ])('fails on %s', async (_, body, contentType) => {
    answerWith(200, body, contentType)

    const error = await failureOf(apiGet('/matrix', { expectJson: true }))

    expect(error).toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      kind: 'contract',
      retryable: false,
      messageKey: 'errors.unexpected_response',
      message: 'The server sent a response this app could not read.',
    })
    expect(error.message).not.toContain('html')
  })

  it('reports the request id the edge answered with', async () => {
    server.use(
      http.get('*/api/matrix', () =>
        HttpResponse.html('<!doctype html>', { headers: { 'X-Request-Id': 'edge-1' } }),
      ),
    )

    expect((await failureOf(apiGet('/matrix', { expectJson: true }))).requestId).toBe('edge-1')
  })

  it.each([
    ['JSON', JSON_TEXT, 'application/json'],
    ['every +json media type', JSON_TEXT, 'application/vnd.api+json; charset=utf-8'],
    ['JSON with no Content-Type', JSON_TEXT, null],
  ])('passes %s', async (_, body, contentType) => {
    answerWith(200, body, contentType)

    expect(await apiGet('/matrix', { expectJson: true })).toEqual({ id: 'ORD-1', items: [1, 2] })
  })

  it('passes a JSON string, which is JSON', async () => {
    answerWith(200, '"ORD-1"', 'application/json')

    expect(await apiGet('/matrix', { expectJson: true })).toBe('ORD-1')
  })

  it.each([
    ['an empty 200', 200, ''],
    ['a 201 of whitespace', 201, ' \n'],
  ])('passes %s, whatever it calls itself', async (_, status, body) => {
    answerWith(status, body, 'text/html')

    await expect(apiFetch.raw('/matrix', { expectJson: true })).resolves.toBeDefined()
  })

  it('passes a 204', async () => {
    answerWith(204, null, null)

    await expect(apiFetch('/matrix', { method: 'DELETE', expectJson: true })).resolves.toBe(
      undefined,
    )
  })

  it('judges by what parsed, not by the label: JSON sent as text/plain, read as JSON', async () => {
    answerWith(200, JSON_TEXT, 'text/plain')

    expect(await apiGet('/matrix', { expectJson: true, responseType: 'json' })).toEqual({
      id: 'ORD-1',
      items: [1, 2],
    })
  })

  it('still fails when that body did not parse', async () => {
    answerWith(200, 'OK', 'text/plain')

    const error = await failureOf(apiGet('/matrix', { expectJson: true, responseType: 'json' }))

    expect(error.code).toBe('UNEXPECTED_RESPONSE')
  })

  it('leaves a call that parses the body itself to judge what it got', async () => {
    answerWith(200, 'a=1', 'text/plain')

    const parsed = await apiGet<{ raw: string }>('/matrix', {
      expectJson: true,
      parseResponse: (text) => ({ raw: text }),
    })

    expect(parsed).toEqual({ raw: 'a=1' })
  })

  it('can be the default of a client made with create()', async () => {
    answerWith(200, 'OK', 'text/plain')
    const strict = apiFetch.create({ expectJson: true })

    expect((await failureOf(strict('/matrix'))).code).toBe('UNEXPECTED_RESPONSE')
    // And a call can still say otherwise.
    expect(await strict('/matrix', { expectJson: false })).toBe('OK')
  })

  it('does not turn a failed response into something else', async () => {
    server.use(
      http.get('*/api/matrix', () => HttpResponse.html('<h1>Bad Gateway</h1>', { status: 502 })),
    )

    expect(await failureOf(apiGet('/matrix', { expectJson: true }))).toMatchObject({
      status: 502,
      kind: 'http',
      code: 'API_ERROR',
    })
  })
})

describe('a backend that mislabels its JSON', () => {
  beforeEach(() => {
    signIn()
    installSeams()
  })

  // The body parsed. What the backend called it is the backend's mistake, and
  // was never the client's to punish.
  it.each(['text/plain', 'text/json', 'text/html', 'application/octet-stream'])(
    'resolves a call that asked for responseType json, from %s',
    async (contentType) => {
      answerWith(200, JSON_TEXT, contentType)

      expect(await apiGet('/matrix', { responseType: 'json' })).toEqual({
        id: 'ORD-1',
        items: [1, 2],
      })
    },
  )

  it('hands over text it could not parse as the text, as ofetch does', async () => {
    answerWith(200, 'OK', 'text/plain')

    expect(await apiPost('/matrix', { sku: 'A-1' }, { responseType: 'json' })).toBe('OK')
  })
})

describe('an Accept header the caller wrote', () => {
  /** Record what the classifiers were told about each response. */
  function watchClassifiers() {
    const seen: Pick<ApiResponseContext, 'expectsJson' | 'contentType'>[] = []
    installApiIntegration(
      resolveApiIntegration({
        classify: ({ expectsJson, contentType }) => {
          seen.push({ expectsJson, contentType })
          return null
        },
      }),
    )
    return seen
  }

  beforeEach(() => signIn())

  it.each(['application/json, text/plain, */*', 'text/csv', 'application/vnd.acme.v2+json', '*/*'])(
    'is the caller’s contract, even when it mentions json: %s',
    async (accept) => {
      const seen = watchClassifiers()
      answerWith(200, 'id,name\n1,Ada', 'text/plain')

      // axios's default `Accept` says text is welcome, and text is what it gets.
      expect(await apiGet('/matrix', { headers: { Accept: accept } })).toBe('id,name\n1,Ada')
      expect(seen).toEqual([{ expectsJson: false, contentType: 'text/plain' }])
    },
  )

  it('is not there when the client sent its own: that request expects JSON', async () => {
    const seen = watchClassifiers()
    answerWith(200, JSON_TEXT, 'application/json')

    await apiGet('/matrix')
    await apiFetch('/matrix', { responseType: 'text' })

    expect(seen.map((context) => context.expectsJson)).toEqual([true, false])
  })

  it('does not excuse a call that also said expectJson', async () => {
    const seen = watchClassifiers()
    answerWith(200, 'OK', 'text/plain')

    const error = await failureOf(
      apiGet('/matrix', { headers: { Accept: 'application/vnd.acme.v2+json' }, expectJson: true }),
    )

    expect(error.code).toBe('UNEXPECTED_RESPONSE')
    expect(seen[0]!.expectsJson).toBe(true)
  })
})

describe('ignoreResponseError', () => {
  /** A refresh endpoint that would work, so a refresh that happens is seen. */
  function refreshEndpoint() {
    const refreshes = { count: 0 }
    server.use(
      http.post('*/api/auth/refresh', () => {
        refreshes.count++
        return HttpResponse.json({ token: 'fresh-token', refreshToken: 'refresh-2' })
      }),
    )
    return refreshes
  }

  beforeEach(() => installSeams())

  it('resolves a 401 with its body after one request: no refresh, no replay, no sign-out', async () => {
    const { onSessionExpired } = signIn()
    const refreshes = refreshEndpoint()
    let requests = 0
    server.use(
      http.get('*/api/matrix', () => {
        requests++
        return HttpResponse.json({ message: 'Token expired.' }, { status: 401 })
      }),
    )

    const response = await apiFetch.raw('/matrix', { ignoreResponseError: true })

    expect(response.status).toBe(401)
    expect(response._data).toEqual({ message: 'Token expired.' })
    expect(requests).toBe(1)
    expect(refreshes.count).toBe(0)
    expect(onSessionExpired).not.toHaveBeenCalled()
  })

  it('agrees with bare ofetch on a 404 with a page for a body', async () => {
    signIn()
    server.use(
      http.get('*/api/matrix', () => HttpResponse.html('<h1>Not Found</h1>', { status: 404 })),
    )
    const options = { ignoreResponseError: true } as const

    const viaOfetch = await ofetch(`${window.location.origin}/api/matrix`, options)

    expect(await apiGet('/matrix', options)).toBe('<h1>Not Found</h1>')
    expect(viaOfetch).toBe('<h1>Not Found</h1>')
  })

  it('leaves the response alone even where a classifier would have spoken', async () => {
    const { onSessionExpired } = signIn()
    const classify = vi.fn(() => 'unauthenticated' as const)
    installApiIntegration(resolveApiIntegration({ classify }))
    const refreshes = refreshEndpoint()
    answerWith(200, '<!doctype html><title>Sign in</title>', 'text/html')

    const page = await apiGet('/matrix', { ignoreResponseError: true, expectJson: true })

    expect(page).toContain('Sign in')
    expect(classify).not.toHaveBeenCalled()
    expect(refreshes.count).toBe(0)
    expect(onSessionExpired).not.toHaveBeenCalled()
  })

  it('still reports a request that got no answer as an AppError', async () => {
    signIn()
    server.use(http.get('*/api/matrix', () => HttpResponse.error()))

    expect(await failureOf(apiGet('/matrix', { ignoreResponseError: true }))).toMatchObject({
      code: 'NETWORK_ERROR',
      kind: 'network',
    })
  })

  it('without it, the same 401 is refreshed and replayed as before', async () => {
    signIn()
    const refreshes = refreshEndpoint()
    let requests = 0
    server.use(
      http.get('*/api/matrix', () => {
        requests++
        return requests === 1
          ? HttpResponse.json({ message: 'Token expired.' }, { status: 401 })
          : HttpResponse.json({ ok: true })
      }),
    )

    expect(await apiGet('/matrix')).toEqual({ ok: true })
    expect(refreshes.count).toBe(1)
    expect(requests).toBe(2)
  })
})
