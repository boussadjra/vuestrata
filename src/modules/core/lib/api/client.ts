import {
  ofetch,
  type $Fetch,
  type CreateFetchOptions,
  type FetchContext,
  type FetchHook,
  type FetchOptions,
  type FetchRequest,
  type FetchResponse,
  type MappedResponseType,
  type ResponseType,
} from 'ofetch'

import { runtimeEnv } from '~/lib/config'
import { AppError, ERROR_MESSAGE_KEYS } from '~/lib/errors'
import { createScopedLogger } from '~/lib/logger'
import { tryGetApiAuthBackend } from '~/lib/runtime'

import {
  applyAuthHeaders,
  getAuthTransport,
  handleTokenRefresh,
  notifySessionExpired,
} from './auth-interceptor'
import { redactUrl, toAppError } from './failure'

export { getAuthTransport, installApiAuth, resetAuthInterceptor } from './auth-interceptor'
export type { ApiAuthProvider } from './types'

/** Options every `apiFetch` call accepts: ofetch's, plus the client's own. */
export interface ApiFetchOptions<
  R extends ResponseType = ResponseType,
  T = any,
> extends FetchOptions<R, T> {
  /**
   * Take a 401 at face value: no token refresh, no replay, no session-expired
   * notification. For requests that are themselves part of authentication — a
   * login, a refresh, a session probe — where a 401 means "no" and refreshing
   * would recurse into the flow that is already failing.
   */
  skipAuthRefresh?: boolean
}

/**
 * The type of `apiFetch`: ofetch's `$Fetch` surface — callable, plus `raw`,
 * `native` and `create` — taking `ApiFetchOptions`. It is assignable to
 * `$Fetch`, so code written against ofetch keeps compiling.
 */
export interface ApiFetch {
  <T = any, R extends ResponseType = 'json'>(
    request: FetchRequest,
    options?: ApiFetchOptions<R>,
  ): Promise<MappedResponseType<R, T>>
  raw<T = any, R extends ResponseType = 'json'>(
    request: FetchRequest,
    options?: ApiFetchOptions<R>,
  ): Promise<FetchResponse<MappedResponseType<R, T>>>
  native: $Fetch['native']
  create(defaults: ApiFetchOptions, globalOptions?: CreateFetchOptions): ApiFetch
}

type ApiRequestOptions = Omit<ApiFetchOptions<'json'>, 'method' | 'body'>
// `runtimeEnv.apiUrl` may be a relative path like '/api'. In Node (tests) a
// relative base breaks URL resolution inside ofetch (new URL requires an
// absolute base). Normalize to an absolute URL using the current origin in
// browser environments, or fall back to http://localhost during tests/Node.
//
// Read through the validated env boundary (core/lib/config) rather than
// import.meta.env directly, so there is one place that decides what a valid
// API URL is.
const _rawBaseURL = runtimeEnv.apiUrl
const baseURL = ((): string => {
  try {
    if (typeof _rawBaseURL !== 'string') return String(_rawBaseURL)
    if (!_rawBaseURL.startsWith('/')) return _rawBaseURL
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost'
    return `${origin.replace(/\/+$/, '')}${_rawBaseURL}`
  } catch {
    // Fallback to raw value if anything unexpected happens.
    return String(_rawBaseURL)
  }
})()
const apiLogger = createScopedLogger('api')

/**
 * CSRF token is read once from the <meta> tag and reused for every request.
 * Hitting the DOM on each call is wasted work and, more importantly, any
 * token rotation that races with an in-flight request would otherwise be
 * silently missed. The cached value is owned by the api-runtime backend (see
 * `app/stores/api-runtime.ts`) so it can be reset between tests.
 */
function getCsrfToken(): string | null {
  const backend = tryGetApiAuthBackend()
  if (!backend) {
    if (typeof document === 'undefined') return null
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? null
  }
  const cached = backend.getCsrfToken()
  if (cached !== undefined) return cached
  if (typeof document === 'undefined') {
    backend.setCsrfToken(null)
    return null
  }
  const fresh = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? null
  backend.setCsrfToken(fresh)
  return fresh
}
function invalidateCsrfToken(): void {
  tryGetApiAuthBackend()?.setCsrfToken(undefined)
}

/** Methods that change nothing server-side, and so need no CSRF token. */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * The transport-dependent part of every request: the auth header,
 * `credentials`, and the CSRF header. Runs before any hook the caller passes,
 * so a caller's own `onRequest` can never switch it off by replacing it.
 */
function applyTransport({ options }: FetchContext): void {
  const headers = new Headers(options.headers as HeadersInit)
  applyAuthHeaders(headers)

  const method = (options.method ?? 'GET').toUpperCase()
  const isMutating = !IDEMPOTENT_METHODS.has(method)
  const transport = getAuthTransport()

  // `credentials` is set per-request rather than once on `ofetch.create`
  // because it depends on the configured auth adapter, which is not known
  // at module-evaluation time. It was previously hardcoded to 'include',
  // so a bearer-token deployment sent ambient cookies on every request
  // while ALSO sending an Authorization header — two credentials for a
  // backend that asked for one.
  options.credentials ??= transport === 'cookie' ? 'include' : 'omit'

  // CSRF is a cookie-transport concern. With bearer tokens there is no
  // ambient credential for a third-party page to ride on, so the header
  // adds nothing; sending it anyway invites a backend to treat header
  // presence as proof of a same-site request.
  if (transport === 'cookie') {
    // If the cached value is null (the meta tag was injected after the first
    // read on a slow hydration) drop the cache and read once more before
    // giving up — permanently null-caching the first miss would silently
    // break every state-changing call.
    let csrfToken = getCsrfToken()
    if (!csrfToken && isMutating) {
      invalidateCsrfToken()
      csrfToken = getCsrfToken()
    }
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken)
    }
  }
  options.headers = headers
}

function hooksOf(hooks: FetchOptions['onRequest']): FetchHook[] {
  if (!hooks) return []
  return Array.isArray(hooks) ? hooks : [hooks]
}

/**
 * Tie the caller's signal to the request's deadline.
 *
 * ofetch arms its `timeout` only when the request carries no `signal` of its
 * own, so passing one — as every cancellable query should — used to switch
 * the timeout off without a word. The linked signal aborts on whichever comes
 * first. The deadline aborts with a `TimeoutError`, as ofetch's own timeout
 * does, so both are classified alike.
 */
function linkDeadline(
  signal: AbortSignal,
  timeoutMs: number,
): { signal: AbortSignal; release: () => void } {
  const controller = new AbortController()
  const forward = () => controller.abort(signal.reason)
  if (signal.aborted) forward()
  else signal.addEventListener('abort', forward, { once: true })

  const timer = setTimeout(() => {
    const reason = new Error('The operation was aborted due to timeout')
    reason.name = 'TimeoutError'
    controller.abort(reason)
  }, timeoutMs)

  return {
    signal: controller.signal,
    release: () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', forward)
    },
  }
}

function urlOf(request: FetchRequest): string {
  return typeof request === 'string' ? request : request.url
}

function hasAuthorization(headers: HeadersInit | undefined): boolean {
  return headers !== undefined && new Headers(headers).has('Authorization')
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === 'number' ? status : undefined
}

/** A request whose body the first attempt did not consume, so it can be sent again. */
function isReplayable(request: FetchRequest, body: unknown): boolean {
  if (typeof request !== 'string' && request.body !== null) return false
  if (typeof body !== 'object' || body === null) return true
  const stream = body as { getReader?: unknown; pipe?: unknown }
  return typeof stream.getReader !== 'function' && typeof stream.pipe !== 'function'
}

function sessionExpiredError(): AppError {
  return new AppError({
    message: 'Your session has expired. Please sign in again.',
    code: 'UNAUTHORIZED',
    status: 401,
    kind: 'http',
    retryable: false,
    messageKey: ERROR_MESSAGE_KEYS.sessionExpired,
  })
}

/**
 * Build a client: a thin wrapper around a raw ofetch instance that owns
 * what ofetch cannot do on its own.
 *
 * - **Every failure is an `AppError`.** ofetch throws a `FetchError` whose
 *   message embeds the full URL and query string, and a network failure or a
 *   timeout used to escape as exactly that. See `core/lib/api/failure.ts`.
 * - **A 401 refreshes and replays.** One refresh, shared by every request that
 *   hit the 401 together, then the original request is sent again — once — with
 *   the new credentials, and the caller receives the replay's result. The
 *   previous hook refreshed and then let the 401 through, so the request that
 *   noticed the expiry failed anyway: a user whose token expired mid-form lost
 *   the save.
 */
function createApiFetch(
  defaults: ApiFetchOptions,
  globalOptions: CreateFetchOptions = {},
): ApiFetch {
  const { skipAuthRefresh: skipAuthRefreshByDefault = false, ...fetchDefaults } = defaults
  const base = ofetch.create(fetchDefaults, globalOptions)

  /** One attempt at the network. */
  async function send(request: FetchRequest, options: FetchOptions): Promise<FetchResponse<any>> {
    const signal = options.signal ?? fetchDefaults.signal
    const timeout = options.timeout ?? fetchDefaults.timeout
    const deadline = signal && timeout ? linkDeadline(signal, timeout) : undefined
    try {
      return await base.raw(request, {
        ...options,
        // The linked signal carries the deadline, and ofetch's own timeout
        // must stay off: with it set, ofetch reads an abort as retryable.
        ...(deadline ? { signal: deadline.signal, timeout: undefined } : {}),
        onRequest: [applyTransport, ...hooksOf(options.onRequest ?? fetchDefaults.onRequest)],
      })
    } finally {
      deadline?.release()
    }
  }

  /**
   * Whether a 401 on this request means "the session's token expired", which
   * a refresh can fix. Decided once, from the request as the caller made it.
   */
  function isRefreshable(request: FetchRequest, options: FetchOptions): boolean {
    // The auth endpoints answer 401 as part of their contract (a wrong
    // password, a spent refresh token), and refreshing in response would
    // re-enter the flow that is already failing.
    if (urlOf(request).includes('/auth/')) return false
    // A credential the caller chose is not the session's to refresh, and a
    // replay would send the session's token in its place.
    const requestHeaders = typeof request === 'string' ? undefined : request.headers
    if (hasAuthorization(options.headers ?? requestHeaders)) return false
    if (hasAuthorization(fetchDefaults.headers)) return false
    // A streamed body was consumed by the first attempt; there is nothing
    // left to replay.
    return isReplayable(request, options.body)
  }

  async function execute(
    request: FetchRequest,
    options: FetchOptions,
    refreshable: boolean,
    replayed: boolean,
  ): Promise<FetchResponse<any>> {
    try {
      return await send(request, options)
    } catch (error) {
      if (!refreshable || statusOf(error) !== 401) throw error

      // The refreshed credential was refused too. The session is over, and
      // refreshing again would loop.
      if (replayed) {
        notifySessionExpired()
        throw sessionExpiredError()
      }

      const retry: { headers?: HeadersInit } = {
        headers: options.headers ?? (typeof request === 'string' ? undefined : request.headers),
      }
      if (!(await handleTokenRefresh(baseURL, retry))) {
        notifySessionExpired()
        throw sessionExpiredError()
      }
      return execute(request, { ...options, headers: retry.headers }, refreshable, true)
    }
  }

  /**
   * Classify a failure and log what an operator needs to find it — never the
   * body, never the query string. Everything that leaves this client passes
   * through here, so a caller only ever sees an `AppError`.
   */
  function fail(error: unknown, request: FetchRequest, options: FetchOptions): AppError {
    if (error instanceof AppError) return error

    const appError = toAppError(error, { signal: options.signal ?? fetchDefaults.signal })
    // The caller cancelled; there is nothing to report.
    if (appError.kind === 'aborted') return appError

    // CSRF token may have rotated; drop the cache so the next request reads
    // the new value from <meta>.
    if (appError.status === 403) invalidateCsrfToken()

    // Do NOT log the response body by default — it frequently contains PII,
    // tokens, or stack traces from the backend. A structured summary is enough
    // for triage; use devtools/network panel for payload inspection.
    const resolved = (error as { request?: unknown } | null)?.request
    apiLogger.error(
      appError.kind === 'http'
        ? `API error ${appError.status}`
        : `API request failed: ${appError.code}`,
      {
        url: redactUrl(typeof resolved === 'string' ? resolved : urlOf(request)),
        code: appError.code,
        requestId: appError.requestId,
      },
    )
    return appError
  }

  async function raw<T = any, R extends ResponseType = 'json'>(
    request: FetchRequest,
    options: ApiFetchOptions<R> = {},
  ): Promise<FetchResponse<MappedResponseType<R, T>>> {
    const { skipAuthRefresh = skipAuthRefreshByDefault, ...rest } = options
    // `R` only shapes what the caller gets back; inside, every call is
    // handled alike whatever its response type.
    const fetchOptions = rest as FetchOptions
    const refreshable = !skipAuthRefresh && isRefreshable(request, fetchOptions)
    try {
      return await execute(request, fetchOptions, refreshable, false)
    } catch (error) {
      throw fail(error, request, fetchOptions)
    }
  }

  async function call<T = any, R extends ResponseType = 'json'>(
    request: FetchRequest,
    options?: ApiFetchOptions<R>,
  ): Promise<MappedResponseType<R, T>> {
    const response = await raw<T, R>(request, options)
    return response._data as MappedResponseType<R, T>
  }

  return Object.assign(call, {
    raw,
    native: base.native,
    create: (more: ApiFetchOptions, moreGlobalOptions: CreateFetchOptions = {}) =>
      createApiFetch({ ...defaults, ...more }, { ...globalOptions, ...moreGlobalOptions }),
  })
}

export const apiFetch: ApiFetch = createApiFetch({
  baseURL,
  // One attempt per call: retries belong to TanStack Query, whose policy
  // (core/lib/api/retry.ts) retries only what can succeed on a second try,
  // with backoff and `Retry-After`. Two layers used to stack — up to eight
  // requests per failing query, in lockstep across every open tab.
  //
  // A caller that knows an endpoint is idempotent can still opt in per
  // request with `retry`; these two settings apply only then. Writes should
  // not: repeating one on a transient failure can apply it twice.
  retry: 0,
  retryDelay: 1000,
  retryStatusCodes: [408, 425, 429, 500, 502, 503, 504],
  // Hard upper bound so a hung backend cannot keep a user-facing request
  // pending indefinitely; individual callers can still override if needed.
  timeout: 15_000,
})

/** Typed GET helper */
export function apiGet<T>(url: string, options?: ApiRequestOptions) {
  return apiFetch<T>(url, { ...options, method: 'GET' })
}

/** Typed POST helper */
export function apiPost<T>(url: string, body?: FetchOptions['body'], options?: ApiRequestOptions) {
  return apiFetch<T>(url, { ...options, method: 'POST', body })
}

/** Typed PUT helper */
export function apiPut<T>(url: string, body?: FetchOptions['body'], options?: ApiRequestOptions) {
  return apiFetch<T>(url, { ...options, method: 'PUT', body })
}

/** Typed PATCH helper */
export function apiPatch<T>(url: string, body?: FetchOptions['body'], options?: ApiRequestOptions) {
  return apiFetch<T>(url, { ...options, method: 'PATCH', body })
}

/** Typed DELETE helper */
export function apiDelete<T>(url: string, options?: ApiRequestOptions) {
  return apiFetch<T>(url, { ...options, method: 'DELETE' })
}
