import { QueryClient, type QueryClientConfig } from '@tanstack/vue-query'
import { createFetchError } from 'ofetch'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { parseRetryAfter } from '@/lib/api/failure'
import { queryRetryDelay, shouldRetryQuery } from '@/lib/api/retry'
import { AppError, transportError } from '@/lib/errors'
import { vueQueryOptions } from '@/plugins/vue-query'

/**
 * The retry policy: which failures a query retries, how often, and how long
 * it waits. Retrying used to happen twice over — ofetch under TanStack — with
 * no backoff and no regard for `Retry-After`.
 */

/** An ofetch error carrying a response, as a query function would see it. */
function httpFailure(status: number, headers: Record<string, string> = {}) {
  return createFetchError({
    request: 'https://api.test/items',
    options: { headers: new Headers() },
    response: new Response(null, { status, headers }),
  })
}

/** An ofetch error for a request that got no response. */
function networkFailure() {
  return createFetchError({
    request: 'https://api.test/items',
    options: { headers: new Headers() },
    error: new TypeError('Failed to fetch'),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shouldRetryQuery', () => {
  it.each([
    ['a network failure', transportError('network')],
    ['a timeout', transportError('timeout')],
    ['a raw ofetch network error', networkFailure()],
  ])('retries %s, twice at most', (_label, error) => {
    expect(shouldRetryQuery(0, error)).toBe(true)
    expect(shouldRetryQuery(1, error)).toBe(true)
    expect(shouldRetryQuery(2, error)).toBe(false)
  })

  it.each([408, 425, 429, 500, 502, 503, 504])('retries a %i', (status) => {
    expect(shouldRetryQuery(0, httpFailure(status))).toBe(true)
  })

  // Any other 4xx is an answer, and asking again gets the same one. Retrying a
  // 404 only delays the not-found page.
  it.each([400, 401, 403, 404, 409, 410, 422])('never retries a %i', (status) => {
    expect(shouldRetryQuery(0, httpFailure(status))).toBe(false)
  })

  it.each([501, 505])('does not retry a %i, which states a missing capability', (status) => {
    expect(shouldRetryQuery(0, httpFailure(status))).toBe(false)
  })

  it.each([
    ['an abort', transportError('aborted')],
    [
      'a contract mismatch',
      new AppError({ message: 'x', code: 'CONTRACT_MISMATCH', kind: 'contract', retryable: false }),
    ],
    ['a runtime error', new TypeError('Cannot read properties of undefined')],
    ['a thrown string', 'boom'],
  ])('never retries %s', (_label, error) => {
    expect(shouldRetryQuery(0, error)).toBe(false)
  })
})

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-09-28T12:00:00Z')

  it('reads delay-seconds', () => {
    expect(parseRetryAfter('7', now)).toBe(7_000)
    expect(parseRetryAfter(' 0 ', now)).toBe(0)
  })

  it('reads an HTTP-date, measured from now', () => {
    expect(parseRetryAfter('Mon, 28 Sep 2026 12:00:30 GMT', now)).toBe(30_000)
  })

  it('reads a date already past as "now"', () => {
    expect(parseRetryAfter('Mon, 28 Sep 2026 11:00:00 GMT', now)).toBe(0)
  })

  // A hostile or mistaken server must not park a query behind a timer for
  // hours; a spinner held that long is worse than an error.
  it('honours at most one minute', () => {
    expect(parseRetryAfter('3600', now)).toBe(60_000)
    expect(parseRetryAfter('Tue, 29 Sep 2026 12:00:00 GMT', now)).toBe(60_000)
  })

  it.each([undefined, null, '', '  ', 'soon', '-5', '1.5', '7s'])(
    'ignores %j, which is neither form',
    (value) => {
      expect(parseRetryAfter(value, now)).toBeUndefined()
    },
  )
})

describe('queryRetryDelay', () => {
  it('backs off exponentially, jittered across the upper half of each step', () => {
    const random = vi.spyOn(Math, 'random')

    const delays = () => [0, 1, 2].map((attempt) => queryRetryDelay(attempt, networkFailure()))

    random.mockReturnValue(0)
    expect(delays()).toEqual([500, 1000, 2000])

    random.mockReturnValue(0.5)
    expect(delays()).toEqual([750, 1500, 3000])
  })

  it('never waits more than 30 seconds on its own account', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)

    expect(queryRetryDelay(20, transportError('network'))).toBeLessThanOrEqual(30_000)
  })

  it('waits at least as long as Retry-After asks', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const error = new AppError({ message: 'x', status: 429, retryable: true, retryAfterMs: 7_000 })

    expect(queryRetryDelay(0, error)).toBe(7_000)
  })

  it('reads Retry-After from the headers of a raw ofetch error', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    expect(queryRetryDelay(0, httpFailure(429, { 'Retry-After': '3' }))).toBe(3_000)
  })
})

describe('the query client configuration', () => {
  /** What the app builds its query client from. */
  function appConfig(): QueryClientConfig {
    // The plugin takes either a config or a ready-made client.
    if (!('queryClientConfig' in vueQueryOptions) || !vueQueryOptions.queryClientConfig) {
      throw new Error('vueQueryOptions no longer configures the query client')
    }
    return vueQueryOptions.queryClientConfig
  }

  it('gives queries the retry policy and mutations no retries', () => {
    const defaults = appConfig().defaultOptions

    expect(defaults?.queries?.retry).toBe(shouldRetryQuery)
    expect(defaults?.queries?.retryDelay).toBe(queryRetryDelay)
    expect(defaults?.mutations?.retry).toBe(false)
  })

  /** The configured client, minus the waiting. */
  function configuredClient() {
    const config = appConfig()
    return new QueryClient({
      ...config,
      defaultOptions: {
        ...config.defaultOptions,
        queries: { ...config.defaultOptions?.queries, retryDelay: 0 },
      },
    })
  }

  // TanStack's failure count starts at 0; this is what pins "at most two
  // retries" to three requests rather than two or four.
  it('runs a query that keeps failing three times, then gives up', async () => {
    const queryFn = vi.fn(() => Promise.reject(transportError('network')))

    await expect(
      configuredClient().fetchQuery({ queryKey: ['flaky'], queryFn }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(queryFn).toHaveBeenCalledTimes(3)
  })

  it('runs a query that 404s once', async () => {
    const queryFn = vi.fn(() => Promise.reject(httpFailure(404)))

    await expect(
      configuredClient().fetchQuery({ queryKey: ['missing'], queryFn }),
    ).rejects.toThrow()
    expect(queryFn).toHaveBeenCalledTimes(1)
  })
})
