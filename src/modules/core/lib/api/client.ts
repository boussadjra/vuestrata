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
import {
  AppError,
  ERROR_MESSAGE_KEYS,
  httpError,
  transportError,
  type MappedError,
} from '~/lib/errors'
import { createScopedLogger } from '~/lib/logger'

import {
  applyAuthHeaders,
  getAuthTransport,
  handleTokenRefresh,
  notifySessionExpired,
} from './auth-interceptor'
import { getCsrfToken, invalidateCsrfToken, primeCsrfToken } from './csrf'
import { isTimeoutReason, parseRetryAfter, redactUrl, toAppError } from './failure'
import {
  currentApiIntegration,
  type ApiIntegration,
  type ApiRequestContext,
  type ApiRequestHook,
  type ApiResponseClass,
  type ApiResponseContext,
} from './integration'
import { createRequestId, createTraceparent } from './tracing'

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
  /**
   * The answer must be JSON. A success with any other body (a web page, a
   * file, a line of text) fails with an `AppError` (`UNEXPECTED_RESPONSE`,
   * kind `contract`) instead of resolving with that body.
   *
   * Off by default, and that is deliberate: plenty of backends answer a write
   * with `OK` or `Created` as plain text, and a caller that ignores the body
   * must not see a save that happened reported as failed. Set it on a call
   * that goes on to read the body as data, where a static host's fallback page
   * or a proxy's error page would otherwise reach a schema as a string. The
   * collection layer sets it on its reads.
   *
   * An empty body always passes, and so does one that parsed as JSON whatever
   * its `Content-Type` says.
   */
  expectJson?: boolean
  /**
   * Treat a URL on another origin as the API.
   *
   * Only a request to the API's own origin (the origin of `VUESTRATA_API_URL`)
   * carries the session: the `Authorization` header, cookies, the CSRF token,
   * and everything `api.overrides.ts` adds (headers, request hooks, tracing).
   * A request to any other origin gets none of them, is never refreshed or
   * replayed, and is not run through the classifiers. `trusted: true` opts
   * one call in, or every call of a client made with `apiFetch.create()`:
   * for a second API of your own that accepts the same credentials. Never for
   * a third party.
   */
  trusted?: boolean
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

/** Methods that change nothing server-side, and so need no CSRF token. */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** `application/json` and every `+json` type, such as `application/problem+json`. */
const JSON_MEDIA_TYPE = /^application\/(?:[\w!#$%&*.^`~-]*\+)?json$/i

/**
 * Whether a request string names its own host. The same test ofetch applies
 * (ufo's `hasProtocol`) to decide whether to put the base URL in front, so the
 * two can never disagree about where a request goes: `//host/path` and
 * `\\host` are paths under the base URL, while `https:/host`, and anything
 * else that opens with a scheme, goes to `fetch` as it is.
 */
const HAS_PROTOCOL = /^[\s\w\0+.-]{2,}:(?:[/\\]{2})?/

/**
 * What one attempt at the network leaves behind for whoever handles its
 * outcome: the hooks run inside ofetch, and this is how what they decided gets
 * back out.
 */
interface Attempt {
  /** The request URL, resolved and without its query string. */
  url: string
  method: string
  /** Whether the request asked for JSON, so any other body is a surprise. */
  expectsJson: boolean
  /** The correlation id this attempt was sent with, if any. */
  requestId?: string
}

/** What was decided about one `apiFetch` call before it was sent, for all its attempts. */
interface CallPolicy {
  /**
   * The request goes to the API's origin, or the call vouched for where it
   * goes. Everything that belongs to the session depends on it.
   */
  forApi: boolean
  /** An unauthenticated answer may be met with a token refresh and a replay. */
  refreshable: boolean
  /** The body survives a first attempt, so the request can be sent again. */
  replayable: boolean
  /** The caller will read the body as JSON: anything else is an error. */
  expectJson: boolean
  /** `ignoreResponseError`: the caller wants the response, whatever it is. */
  passThrough: boolean
}

/** One `apiFetch` call, across its replays. */
interface CallState {
  /** The session was refreshed for this call; a second refusal ends it. */
  refreshed: boolean
  /** The CSRF token was renewed for this call; a second refusal is final. */
  csrfReplayed: boolean
  /** The attempt in progress, or the last one made. */
  attempt?: Attempt
  /** The last response received, and what the classifiers made of it. */
  answer?: { context: ApiResponseContext; verdict: ApiResponseClass | null }
}

function urlOf(request: FetchRequest): string {
  return typeof request === 'string' ? request : request.url
}

/** Whether ofetch will resolve this request against the base URL. */
function isUnderBase(request: FetchRequest, base: string | undefined): boolean {
  return typeof request === 'string' && Boolean(base) && !HAS_PROTOCOL.test(request)
}

/**
 * The request URL as a hook sees it: absolute, and without the query string,
 * which is where user data travels.
 */
function resolveUrl(request: FetchRequest, base: string | undefined): string {
  const raw = redactUrl(urlOf(request))
  if (!isUnderBase(request, base)) return raw
  return `${base!.replace(/\/+$/, '')}/${raw.replace(/^\/+/, '')}`
}

function pageOrigin(): string {
  return typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost'
}

/** The origin a URL leads to, as `fetch` will resolve it. `undefined` for one it cannot parse. */
function originOf(url: string): string | undefined {
  try {
    return new URL(url, pageOrigin()).origin
  } catch {
    return undefined
  }
}

/** The origin of the API: the one place the session's credentials are for. */
const apiOrigin = originOf(baseURL)

/**
 * Whether a request goes to the API's origin.
 *
 * `apiFetch` accepts any URL, and it used to treat them all alike: a call to
 * `https://hooks.example/notify` carried the user's bearer token, and under
 * the cookie transport the CSRF token and `credentials: 'include'`. Whatever a
 * project then added for its API in `api.overrides.ts` (a gateway key, a
 * tenant) would have gone along. The session is for the API, so the question
 * is asked once per call and everything else follows from the answer.
 *
 * A URL that cannot be parsed is not the API: the request will fail anyway,
 * and it should fail without credentials on it.
 */
function isApiRequest(request: FetchRequest, base: string | undefined): boolean {
  const origin = originOf(isUnderBase(request, base) ? base! : urlOf(request))
  return origin !== undefined && origin === apiOrigin
}

/**
 * The CSRF header, under the cookie transport.
 *
 * If no token can be read for a state-changing request — the meta tag was
 * injected after the first read on a slow hydration, or the visitor has no
 * token cookie yet — drop the cache and read once more, then ask the strategy
 * to fetch one, before giving up: permanently null-caching the first miss
 * would silently break every state-changing call.
 *
 * Answers the header it set, so the hooks that run next cannot take it away.
 */
async function applyCsrfHeader(
  headers: Headers,
  isMutating: boolean,
  integration: ApiIntegration,
  base: string,
): Promise<string | undefined> {
  const strategy = integration.csrf
  if (strategy.source === 'none') return undefined

  let csrfToken = getCsrfToken(strategy)
  if (!csrfToken && isMutating) {
    invalidateCsrfToken()
    csrfToken = getCsrfToken(strategy)
    if (!csrfToken && (await primeCsrfToken(strategy, base, integration.csrfPrime))) {
      csrfToken = getCsrfToken(strategy)
    }
  }
  if (!csrfToken) return undefined
  headers.set(strategy.header, csrfToken)
  return strategy.header
}

/**
 * Whether requests carry a CSRF header at all. Without one a replay would be
 * the same request again, and a second refusal.
 */
function sendsCsrf(integration: ApiIntegration): boolean {
  return getAuthTransport() === 'cookie' && integration.csrf.source !== 'none'
}

function hookFailure(): AppError {
  return new AppError({
    message: 'The request could not be sent.',
    code: 'REQUEST_HOOK_FAILED',
    status: 0,
    kind: 'unknown',
    retryable: false,
    messageKey: ERROR_MESSAGE_KEYS.unknown,
  })
}

/**
 * Run the integration's request hooks, in order.
 *
 * A hook that throws fails the request with an `AppError`: the alternative is
 * a raw exception from inside ofetch, which no caller is written to catch.
 *
 * `guarded` names the headers the client applied for the session
 * (`Authorization`, the CSRF header). A hook may add headers and change the
 * ones that are its business, but these are put back if it touched them: a
 * tenant hook with a typo must not be able to send a request unauthenticated.
 */
async function runRequestHooks(
  hooks: readonly ApiRequestHook[],
  attempt: Attempt,
  headers: Headers,
  guarded: readonly string[],
  fromCaller: ReadonlySet<string>,
): Promise<void> {
  if (hooks.length === 0) return

  const applied = guarded.map((name) => [name, headers.get(name)] as const)
  const context: ApiRequestContext = {
    url: attempt.url,
    method: attempt.method,
    headers,
    setHeader(name, value) {
      if (value === null || value === undefined) headers.delete(name)
      else headers.set(name, value)
    },
    hasCallerHeader: (name) => fromCaller.has(name.toLowerCase()),
  }

  for (const hook of hooks) {
    try {
      await hook(context)
    } catch (error) {
      if (error instanceof AppError) throw error
      apiLogger.error('A request hook threw; the request was not sent', {
        url: attempt.url,
        error,
      })
      throw hookFailure()
    }
  }

  for (const [name, value] of applied) {
    if (value === null || headers.get(name) === value) continue
    headers.set(name, value)
    apiLogger.warn(`A request hook changed the ${name} header; the client's value was restored`)
  }
}

/**
 * Everything the client puts on a request, in this order:
 *
 *  1. the auth header, `credentials` and the CSRF header, which depend on the
 *     transport
 *  2. the built-in headers: `Accept: application/json` unless the caller chose
 *     an `Accept` or a non-JSON `responseType`, and the correlation headers
 *     when tracing is on
 *  3. the integration's request hooks, among them `Accept-Language`
 *
 * Only `Accept` goes on a request that is not for the API (see
 * `isApiRequest`): the rest is the session, or the project's arrangements with
 * its own backend, and neither is anyone else's to receive.
 */
async function applyRequestSetup(
  { request, options }: FetchContext,
  attempt: Attempt,
  integration: ApiIntegration,
  policy: CallPolicy,
): Promise<void> {
  const headers = new Headers(options.headers as HeadersInit)
  // The names the request carried before the client touched it. `Headers`
  // iterates them in lower case.
  const fromCaller = new Set(headers.keys())

  const method = (options.method ?? 'GET').toUpperCase()
  const isMutating = !IDEMPOTENT_METHODS.has(method)
  const transport = getAuthTransport()
  attempt.method = method
  attempt.url = resolveUrl(request, options.baseURL)

  let csrfHeader: string | undefined
  if (policy.forApi) {
    applyAuthHeaders(headers)

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
      csrfHeader = await applyCsrfHeader(
        headers,
        isMutating,
        integration,
        options.baseURL ?? baseURL,
      )
    }
  } else {
    // Another origin's cookies are not this app's session. A caller that
    // wants them sent says so with `credentials` on the call.
    options.credentials ??= 'omit'
  }

  // Say what the client can read. Without it a backend answers a browser, not
  // an API client: Laravel redirects an expired session to its login page
  // instead of answering 401. `Accept` is CORS-safelisted, so this costs no
  // preflight. A caller that asked for a blob or a stream gets the browser's
  // default, as before.
  const wantsJson = options.responseType === undefined || options.responseType === 'json'
  if (wantsJson && !headers.has('Accept')) headers.set('Accept', 'application/json')

  const { tracing } = integration
  if (policy.forApi) {
    if (tracing.requestId && !headers.has(tracing.requestIdHeader)) {
      headers.set(tracing.requestIdHeader, createRequestId())
    }
    if (tracing.traceparent && !headers.has('traceparent')) {
      headers.set('traceparent', createTraceparent(tracing.sampled))
    }

    await runRequestHooks(
      integration.requestHooks,
      attempt,
      headers,
      csrfHeader ? ['Authorization', csrfHeader] : ['Authorization'],
      fromCaller,
    )
  }

  // Read back after the hooks: a hook may set either header too.
  attempt.requestId = headers.get(tracing.requestIdHeader) ?? undefined
  // An `Accept` the caller wrote is the caller's contract, whatever it lists:
  // `application/json, text/plain, */*` says text is welcome.
  attempt.expectsJson =
    policy.expectJson || (wantsJson && !options.parseResponse && !fromCaller.has('accept'))
  options.headers = headers
}

/**
 * Settle with `work`, unless the request's deadline passes or its caller gives
 * up first.
 *
 * ofetch arms its timeout only once the request hooks have returned, so a hook
 * waiting on a key service that never answers, or a CSRF prime function that
 * never settles, used to hold the request open long past its deadline, with a
 * spinner nothing would ever end.
 */
function beforeDeadline<T>(
  work: Promise<T>,
  signal: AbortSignal | null | undefined,
  timeoutMs: number | undefined,
): Promise<T> {
  if (!signal && !timeoutMs) return work

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => finish(() => reject(abortError(signal)))
    const timer = timeoutMs
      ? setTimeout(() => finish(() => reject(transportError('timeout'))), timeoutMs)
      : undefined
    const finish = (settle: () => void) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      settle()
    }

    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
    work.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    )
  })
}

/** The error for a request whose signal fired: a deadline that passed, or a caller that left. */
function abortError(signal: AbortSignal | null | undefined): AppError {
  return transportError(isTimeoutReason(signal?.reason) ? 'timeout' : 'aborted')
}

/**
 * `applyRequestSetup`, within the request's deadline.
 *
 * Runs before any hook the caller passes, so a caller's own `onRequest` can
 * never switch it off by replacing it.
 */
async function prepareRequest(
  context: FetchContext,
  attempt: Attempt,
  integration: ApiIntegration,
  policy: CallPolicy,
): Promise<void> {
  const { options } = context
  const startedAt = Date.now()
  await beforeDeadline(
    applyRequestSetup(context, attempt, integration, policy),
    options.signal,
    options.timeout,
  )
  // One deadline for the attempt, not one for the hooks and another for the
  // network: ofetch starts its timer after this returns, with what is left.
  // (With a caller's signal the deadline is `linkDeadline`'s, and already
  // covers both.)
  if (!options.signal && options.timeout) {
    options.timeout = Math.max(1, options.timeout - (Date.now() - startedAt))
  }
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

function hasAuthorization(headers: HeadersInit | undefined): boolean {
  return headers !== undefined && new Headers(headers).has('Authorization')
}

/** The response an ofetch failure carries, when the server answered at all. */
function responseOf(error: unknown): FetchResponse<any> | undefined {
  const response = (error as { response?: unknown } | null)?.response
  const headers = (response as { headers?: { get?: unknown } } | undefined)?.headers
  return typeof headers?.get === 'function' ? (response as FetchResponse<any>) : undefined
}

function mediaTypeOf(response: Response): string {
  return (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
}

function isEmptyBody(body: unknown): boolean {
  return body === undefined || body === null || (typeof body === 'string' && body.trim() === '')
}

/**
 * Whether a response's body is JSON, or nothing at all.
 *
 * Decided by what ofetch made of the body, not by its label: a backend that
 * calls its JSON `text/plain` is wrong about the label and right about the
 * data. A value that parsed is an object, an array, a number or a boolean. A
 * string is what ofetch hands back when the body did NOT parse, unless the
 * response declared JSON, in which case the body was a JSON string. A blob or
 * a stream is a file.
 */
function isJsonBody(response: FetchResponse<any>): boolean {
  const body: unknown = response._data
  if (isEmptyBody(body)) return true
  if (typeof body === 'string') {
    const mediaType = mediaTypeOf(response)
    return mediaType === '' || JSON_MEDIA_TYPE.test(mediaType)
  }
  if (typeof body !== 'object') return true
  const tag = Object.prototype.toString.call(body)
  return tag === '[object Object]' || tag === '[object Array]'
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

function describeResponse(response: FetchResponse<any>, attempt: Attempt): ApiResponseContext {
  return {
    url: attempt.url,
    method: attempt.method,
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    contentType: mediaTypeOf(response),
    redirected: response.redirected,
    responseUrl: response.url || attempt.url,
    body: response._data,
    expectsJson: attempt.expectsJson,
  }
}

/**
 * Ask the classifiers what a response means. The first answer wins; a
 * classifier that throws is skipped, and logged, rather than failing a request
 * the server may have answered perfectly well.
 */
function classify(
  context: ApiResponseContext,
  integration: ApiIntegration,
): ApiResponseClass | null {
  for (const classifier of integration.classifiers) {
    try {
      const verdict = classifier(context)
      if (verdict) return verdict
    } catch (error) {
      apiLogger.error('A response classifier threw and was skipped', { url: context.url, error })
    }
  }
  return null
}

/** What the error mappers read in a failed response's body. */
function mapErrorBody(
  context: ApiResponseContext,
  integration: ApiIntegration,
): MappedError | null {
  for (const mapper of integration.errorMappers) {
    try {
      const mapped = mapper(context)
      if (mapped) return mapped
    } catch (error) {
      apiLogger.error('An error mapper threw and was skipped', { url: context.url, error })
    }
  }
  return null
}

/**
 * The `AppError` for a response with an error status, or for one the
 * classifiers read as a refusal.
 */
function responseError(
  context: ApiResponseContext,
  verdict: ApiResponseClass | null,
  integration: ApiIntegration,
  attempt: Attempt | undefined,
): AppError {
  // A success has no error body to map: it is here because of what it means.
  const mapped = context.ok ? null : mapErrorBody(context, integration)
  const requestId =
    mapped?.requestId ??
    context.headers.get(integration.tracing.requestIdHeader) ??
    attempt?.requestId
  const retryAfterMs = parseRetryAfter(context.headers.get('retry-after'))

  if (verdict === 'csrf') {
    // The backend's wording for this ("CSRF token mismatch.") tells a user
    // nothing they can act on, so the client's own message is the one shown.
    return httpError(
      context.status,
      { code: mapped?.code, requestId },
      { retryAfterMs, messageKey: ERROR_MESSAGE_KEYS.csrf, fallbackCode: 'CSRF_TOKEN_MISMATCH' },
    ).with({ message: 'Your session could not be verified. Please try again.' })
  }
  if (verdict === 'unauthenticated') {
    // Whatever status said it (a 403 from DRF, a 200 login page after a
    // redirect), callers get the one they already check for.
    return httpError(
      401,
      { ...mapped, requestId },
      { retryAfterMs, fallbackCode: context.status === 401 ? undefined : 'UNAUTHENTICATED' },
    )
  }
  if (verdict === 'forbidden') {
    return httpError(
      context.status,
      { ...mapped, requestId },
      { retryAfterMs, messageKey: 'errors.status_403', fallbackCode: 'FORBIDDEN' },
    )
  }
  return httpError(context.status, { ...mapped, requestId }, { retryAfterMs })
}

/**
 * The error for a success that is not the API's answer: a web page or a file
 * where the caller was going to read JSON. A misrouted API URL answered by a
 * static host's fallback page, a proxy's interstitial, a redirect to a page.
 * Left alone it reaches a schema as a string, and fails three layers down as
 * a validation error nobody can read.
 */
function unexpectedResponse(
  response: FetchResponse<any>,
  attempt: Attempt,
  integration: ApiIntegration,
): AppError {
  apiLogger.error('API answered with a body that is not JSON', {
    url: attempt.url,
    status: response.status,
    contentType: mediaTypeOf(response),
  })
  return new AppError({
    message: 'The server sent a response this app could not read.',
    code: 'UNEXPECTED_RESPONSE',
    kind: 'contract',
    retryable: false,
    messageKey: ERROR_MESSAGE_KEYS.unexpectedResponse,
    requestId: response.headers.get(integration.tracing.requestIdHeader) ?? attempt.requestId,
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
 * - **The backend's conventions are configuration.** Which headers every
 *   request carries, what counts as "not signed in" or "stale CSRF token", and
 *   how an error body is read all come from the `ApiIntegration` the bootstrap
 *   installed (`core/lib/api/integration.ts`), read on every request.
 * - **The session stays on the API's origin.** Credentials, the CSRF token and
 *   the integration's headers go to the API and nowhere else; see
 *   `isApiRequest` and the `trusted` option.
 * - **A success is ofetch's success.** Unless a call says `expectJson` or a
 *   classifier says otherwise, a 2xx resolves with exactly what bare ofetch
 *   would have returned; `test/integration/api/response-matrix.test.ts` holds
 *   the client to that.
 */
function createApiFetch(
  defaults: ApiFetchOptions,
  globalOptions: CreateFetchOptions = {},
): ApiFetch {
  const {
    skipAuthRefresh: skipAuthRefreshByDefault = false,
    expectJson: expectJsonByDefault = false,
    trusted: trustedByDefault = false,
    ...fetchDefaults
  } = defaults
  const base = ofetch.create(fetchDefaults, globalOptions)

  /** One attempt at the network. */
  async function send(
    request: FetchRequest,
    options: FetchOptions,
    attempt: Attempt,
    integration: ApiIntegration,
    policy: CallPolicy,
  ): Promise<FetchResponse<any>> {
    const signal = options.signal ?? fetchDefaults.signal
    const timeout = options.timeout ?? fetchDefaults.timeout ?? integration.timeoutMs
    const deadline = signal && timeout ? linkDeadline(signal, timeout) : undefined
    // The integration's `redirect` is the API's, and a call's own always wins.
    const redirect =
      policy.forApi &&
      integration.redirect === 'error' &&
      !options.redirect &&
      !fetchDefaults.redirect
        ? ({ redirect: 'error' } as const)
        : {}
    try {
      return await base.raw(request, {
        ...options,
        ...redirect,
        timeout,
        // The linked signal carries the deadline, and ofetch's own timeout
        // must stay off: with it set, ofetch reads an abort as retryable.
        ...(deadline ? { signal: deadline.signal, timeout: undefined } : {}),
        onRequest: [
          (context) => prepareRequest(context, attempt, integration, policy),
          ...hooksOf(options.onRequest ?? fetchDefaults.onRequest),
        ],
      })
    } finally {
      deadline?.release()
    }
  }

  /**
   * Whether an unauthenticated answer to this request means "the session's
   * token expired", which a refresh can fix. Decided once, from the request as
   * the caller made it.
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
    policy: CallPolicy,
    state: CallState,
  ): Promise<FetchResponse<any>> {
    const integration = currentApiIntegration()
    const attempt: Attempt = { url: redactUrl(urlOf(request)), method: 'GET', expectsJson: false }
    state.attempt = attempt
    state.answer = undefined

    let response: FetchResponse<any> | undefined
    let failure: unknown
    try {
      response = await send(request, options, attempt, integration, policy)
    } catch (error) {
      failure = error
      response = responseOf(error)
    }
    // No answer at all: the network, a deadline, an abort, a hook that threw.
    if (!response) throw failure

    // The API sent the request on to another origin, and everything on it but
    // `Authorization` and the cookies went along: the browser decides that,
    // not this client. Worth a line, because nobody chose it. See `redirect`
    // in `ApiConventions` for refusing redirects outright.
    if (policy.forApi && response.redirected && originOf(response.url) !== originOf(attempt.url)) {
      apiLogger.warn('An API request was redirected to another origin', {
        url: attempt.url,
        to: originOf(response.url),
      })
    }

    // The caller asked for the response whatever it is (`ignoreResponseError`):
    // a 401 it means to read is not a session to refresh, and a body it means
    // to inspect is not the client's to judge.
    if (policy.passThrough) {
      if (failure !== undefined) throw failure
      return response
    }

    const context = describeResponse(response, attempt)
    // The classifiers describe the API. What another origin answers is not
    // theirs to read: its 401 says nothing about this app's session.
    const verdict = policy.forApi ? classify(context, integration) : null
    state.answer = { context, verdict }

    if (verdict === 'unauthenticated' && policy.refreshable) {
      // The refreshed credential was refused too. The session is over, and
      // refreshing again would loop.
      if (state.refreshed) {
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
      state.refreshed = true
      return execute(request, { ...options, headers: retry.headers }, policy, state)
    }

    // A stale CSRF token: read a new one — fetching it first, if the strategy
    // can — and send the request again. Once: a backend that refuses the new
    // token too is refusing for another reason. Only where a token is sent:
    // under the bearer transport the replay would change nothing.
    if (
      verdict === 'csrf' &&
      failure !== undefined &&
      policy.replayable &&
      !state.csrfReplayed &&
      sendsCsrf(integration)
    ) {
      state.csrfReplayed = true
      invalidateCsrfToken()
      // Within the deadline the request itself had: a prime that hangs must
      // not hold the replay, and the caller, for ever.
      await beforeDeadline(
        primeCsrfToken(
          integration.csrf,
          options.baseURL ?? fetchDefaults.baseURL ?? baseURL,
          integration.csrfPrime,
        ),
        options.signal ?? fetchDefaults.signal,
        options.timeout ?? fetchDefaults.timeout ?? integration.timeoutMs,
      )
      return execute(request, options, policy, state)
    }

    if (failure !== undefined) throw failure

    // A success that is not one. The request cannot be refreshed (a session
    // probe, a caller's own credential), so it fails as the 401 it stands for.
    if (verdict === 'unauthenticated') {
      const error = responseError(context, verdict, integration, attempt)
      apiLogger.error('API answered with a sign-in page', { url: attempt.url, code: error.code })
      throw error
    }

    // A success that is not the API's answer: a classifier said so, or the
    // caller was going to read JSON (`expectJson`) and this is not it. A call
    // that parses the body itself is the judge of what it got.
    const ownParser = options.parseResponse ?? fetchDefaults.parseResponse
    if (verdict === 'unexpected' || (policy.expectJson && !ownParser && !isJsonBody(response))) {
      throw unexpectedResponse(response, attempt, integration)
    }

    return response
  }

  /**
   * Classify a failure and log what an operator needs to find it — never the
   * body, never the query string. Everything that leaves this client passes
   * through here, so a caller only ever sees an `AppError`.
   */
  function fail(
    error: unknown,
    request: FetchRequest,
    options: FetchOptions,
    state: CallState,
  ): AppError {
    if (error instanceof AppError) return error

    const answer = responseOf(error) ? state.answer : undefined
    let appError = answer
      ? responseError(answer.context, answer.verdict, currentApiIntegration(), state.attempt)
      : toAppError(error, { signal: options.signal ?? fetchDefaults.signal })
    // The caller cancelled; there is nothing to report.
    if (appError.kind === 'aborted') return appError

    // A request that got no answer has only the id it was sent with.
    if (!appError.requestId && state.attempt?.requestId) {
      appError = appError.with({ requestId: state.attempt.requestId })
    }

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
    const {
      skipAuthRefresh = skipAuthRefreshByDefault,
      expectJson = expectJsonByDefault,
      trusted = trustedByDefault,
      ...rest
    } = options
    // `R` only shapes what the caller gets back; inside, every call is
    // handled alike whatever its response type.
    const fetchOptions = rest as FetchOptions
    const forApi = trusted || isApiRequest(request, fetchOptions.baseURL ?? fetchDefaults.baseURL)
    const passThrough =
      (fetchOptions.ignoreResponseError ?? fetchDefaults.ignoreResponseError) === true
    const policy: CallPolicy = {
      forApi,
      // The session's token was not sent to another origin, so a 401 from
      // there is not the session's, and a caller reading error responses
      // itself has said what it wants done with a 401: nothing.
      refreshable:
        forApi && !passThrough && !skipAuthRefresh && isRefreshable(request, fetchOptions),
      replayable: isReplayable(request, fetchOptions.body),
      expectJson,
      passThrough,
    }
    const state: CallState = { refreshed: false, csrfReplayed: false }
    try {
      return await execute(request, fetchOptions, policy, state)
    } catch (error) {
      throw fail(error, request, fetchOptions, state)
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
  // No `timeout` here: the deadline is the integration's `timeoutMs` (15 s
  // unless `api.overrides.ts` says otherwise), read per request so it can be
  // configured after this module is evaluated.
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
