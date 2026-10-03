/**
 * Where the CSRF token comes from, and which header carries it back.
 *
 * A cookie session needs one on every state-changing request, and every
 * framework hands it over differently: Rails renders it into a `<meta>` tag,
 * Laravel, Django and Spring set a cookie the page reads and echoes (the
 * double-submit pattern), and each expects its own header name. A strategy is
 * that difference written down as data, so the API client and the token
 * refresh read the token the same way.
 *
 * The project picks one in `app/config/api.overrides.ts`. Without one, the
 * `meta` strategy below applies, which is what the client always did.
 *
 * Framework-agnostic: `document` is reached through `globalThis` and guarded,
 * so this loads in Node and in a worker.
 */
import { ofetch } from 'ofetch'

import { createScopedLogger } from '~/lib/logger'
import { tryGetApiAuthBackend } from '~/lib/runtime'

/** What a `prime` function is given. */
export interface CsrfPrimeContext {
  /** The API base URL, absolute. */
  baseURL: string
}

/**
 * How to obtain a token when there is none to read: a URL to `GET` with
 * cookies, or a function that does whatever the backend needs.
 *
 * A URL is resolved against the API base URL the way a link is resolved
 * against a page: `/sanctum/csrf-cookie` lands on the API's ORIGIN, not under
 * its `/api` prefix, which is where Laravel serves it.
 */
export type CsrfPrime = string | ((context: CsrfPrimeContext) => Promise<void>)

/** A token read from the page, and the header it is sent in. */
export interface CsrfTokenStrategy {
  /**
   * `meta` reads `<meta name="…" content="token">`, rendered by the server
   * into the HTML. `cookie` reads a cookie JavaScript can see.
   */
  source: 'meta' | 'cookie'
  /** The meta tag's `name`, or the cookie's. */
  name: string
  /** The request header the token is sent in. */
  header: string
  /** Fetch a token when a state-changing request finds none. */
  prime?: CsrfPrime
  /** Turn the stored value into the header value (Laravel percent-encodes its cookie). */
  decode?: (raw: string) => string
}

/** No CSRF header at all: the backend relies on `SameSite` cookies, or has no cookie session. */
export interface CsrfDisabled {
  source: 'none'
}

export type CsrfStrategy = CsrfTokenStrategy | CsrfDisabled

/**
 * `<meta name="csrf-token">` sent as `X-CSRF-Token`: the client's behaviour
 * before strategies existed, and still the default.
 */
export const DEFAULT_CSRF_STRATEGY: CsrfTokenStrategy = Object.freeze({
  source: 'meta',
  name: 'csrf-token',
  header: 'X-CSRF-Token',
})

/**
 * The conventions of the frameworks that ship one.
 *
 * - `laravel`: Sanctum's SPA flow. The `XSRF-TOKEN` cookie is percent-encoded
 *   and must be decoded before it goes into `X-XSRF-TOKEN`; a visitor who has
 *   no cookie yet gets one from `GET /sanctum/csrf-cookie`.
 * - `django`: the `csrftoken` cookie, echoed as `X-CSRFToken`. The cookie
 *   exists once any view rendered with `ensure_csrf_cookie` has answered.
 * - `spring`: `CookieCsrfTokenRepository.withHttpOnlyFalse()`.
 * - `rails`: `csrf_meta_tags`, which is the default strategy.
 */
export const csrfPresets: Readonly<{
  laravel: CsrfTokenStrategy
  django: CsrfTokenStrategy
  spring: CsrfTokenStrategy
  rails: CsrfTokenStrategy
  none: CsrfDisabled
}> = {
  laravel: {
    source: 'cookie',
    name: 'XSRF-TOKEN',
    header: 'X-XSRF-TOKEN',
    prime: '/sanctum/csrf-cookie',
    decode: decodeURIComponent,
  },
  django: { source: 'cookie', name: 'csrftoken', header: 'X-CSRFToken' },
  spring: { source: 'cookie', name: 'XSRF-TOKEN', header: 'X-XSRF-TOKEN' },
  rails: DEFAULT_CSRF_STRATEGY,
  none: { source: 'none' },
}

/**
 * How long a prime step may take, a URL or a function alike, before the
 * request waiting on it goes ahead without. A function that never settles
 * would otherwise hold every state-changing request that follows it.
 */
const PRIME_TIMEOUT_MS = 10_000

/**
 * How long a prime that left no token to read is not tried again. A backend
 * whose cookie is `HttpOnly`, or set for another domain, primes "successfully"
 * for ever and never yields a token; without this every state-changing
 * request would bring a prime request of its own.
 */
const PRIME_RETRY_AFTER_MS = 10_000

/**
 * What is known about priming, between requests: the prime in progress, which
 * every request that needs a token shares, and when a fruitless one may be
 * tried again. Lives in the installed `ApiIntegration`, so it is replaced with
 * it and never outlives a test.
 */
export interface CsrfPrimeState {
  inFlight: Promise<boolean> | null
  /** A timestamp. Before it, a request that finds no token does not prime. */
  retryAfter: number
}

export function createCsrfPrimeState(): CsrfPrimeState {
  return { inFlight: null, retryAfter: 0 }
}

const csrfLogger = createScopedLogger('api:csrf')

function currentDocument(): Document | undefined {
  return (globalThis as { document?: Document }).document
}

function readMeta(name: string): string | null {
  const page = currentDocument()
  if (!page) return null
  // The name is compared, not interpolated into a selector, so a name with a
  // quote in it cannot change what is selected.
  for (const tag of page.querySelectorAll('meta[name]')) {
    if (tag.getAttribute('name') === name) return tag.getAttribute('content')
  }
  return null
}

function readCookie(name: string): string | null {
  const jar = currentDocument()?.cookie
  if (!jar) return null
  for (const pair of jar.split(';')) {
    const separator = pair.indexOf('=')
    if (separator === -1) continue
    if (pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim()
  }
  return null
}

/**
 * Read the token from where the strategy says it is, uncached. `null` when it
 * is not there, when there is no document, or when the strategy is `none`.
 */
export function readCsrfToken(strategy: CsrfStrategy): string | null {
  if (strategy.source === 'none') return null

  const raw = strategy.source === 'cookie' ? readCookie(strategy.name) : readMeta(strategy.name)
  if (!raw) return null
  if (!strategy.decode) return raw
  try {
    return strategy.decode(raw) || null
  } catch {
    // A cookie that is not valid percent-encoding is not a token either.
    csrfLogger.warn('The CSRF token could not be decoded', { source: strategy.source })
    return null
  }
}

/**
 * The token to send with a request.
 *
 * A meta tag is read once and reused: it cannot change without a page load, and
 * a token rotation that races with a request in flight would otherwise go
 * unnoticed. The cached value is owned by the api-runtime backend (see
 * `app/stores/api-runtime.ts`) so it can be reset between tests.
 *
 * A cookie is read every time. The backend rewrites it whenever it likes
 * (Django on login, Laravel on every response) and a cached copy would be the
 * stale one.
 */
export function getCsrfToken(strategy: CsrfStrategy): string | null {
  if (strategy.source !== 'meta') return readCsrfToken(strategy)

  const backend = tryGetApiAuthBackend()
  if (!backend) return readCsrfToken(strategy)

  const cached = backend.getCsrfToken()
  if (cached !== undefined) return cached
  const fresh = readCsrfToken(strategy)
  backend.setCsrfToken(fresh)
  return fresh
}

/** Forget the cached token, so the next request reads it again. */
export function invalidateCsrfToken(): void {
  tryGetApiAuthBackend()?.setCsrfToken(undefined)
}

/**
 * Run the strategy's prime step, if it has one. Answers whether it ran and
 * succeeded.
 *
 * Never throws. A failed prime leaves the request without a token, the backend
 * refuses it, and that refusal is the error worth showing: it says what the
 * user can do about it, and this one does not.
 *
 * With a `state`, requests share the work: three writes that find no token
 * together wait on one prime, and after a prime that left nothing to read the
 * next one is not attempted for `PRIME_RETRY_AFTER_MS`.
 */
export async function primeCsrfToken(
  strategy: CsrfStrategy,
  baseURL: string,
  state?: CsrfPrimeState,
): Promise<boolean> {
  if (strategy.source === 'none' || !strategy.prime) return false
  if (!state) return runPrime(strategy.prime, baseURL)

  if (state.inFlight) return state.inFlight
  // Only while there is still nothing to read: a token that has appeared since
  // (a sign-in set the cookie) means the last result no longer describes the
  // backend.
  if (Date.now() < state.retryAfter && !readCsrfToken(strategy)) return false

  const flight = runPrime(strategy.prime, baseURL)
    .then((primed) => {
      state.retryAfter = readCsrfToken(strategy) ? 0 : Date.now() + PRIME_RETRY_AFTER_MS
      return primed
    })
    .finally(() => {
      if (state.inFlight === flight) state.inFlight = null
    })
  state.inFlight = flight
  return flight
}

/** Reject after `ms`, so a prime function that never settles cannot hold a request for ever. */
function within<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const reason = new Error('The CSRF prime step timed out')
      reason.name = 'TimeoutError'
      reject(reason)
    }, ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

async function runPrime(prime: CsrfPrime, baseURL: string): Promise<boolean> {
  try {
    if (typeof prime === 'function') {
      await within(Promise.resolve(prime({ baseURL })), PRIME_TIMEOUT_MS)
    } else {
      // Bare `ofetch`, not `apiFetch`: this runs inside a request of the API
      // client, and going back through it would ask for a token to fetch the
      // token.
      await ofetch.raw(resolvePrimeUrl(prime, baseURL), {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        retry: 0,
        timeout: PRIME_TIMEOUT_MS,
        // The answer is a cookie. Whatever the body is, it is not parsed.
        responseType: 'text',
      })
    }
    invalidateCsrfToken()
    return true
  } catch (error) {
    csrfLogger.warn('The CSRF token could not be primed', {
      status: (error as { response?: { status?: number } } | null)?.response?.status,
    })
    return false
  }
}

function resolvePrimeUrl(prime: string, baseURL: string): string {
  try {
    return new URL(prime, baseURL.endsWith('/') ? baseURL : `${baseURL}/`).href
  } catch {
    return prime
  }
}
