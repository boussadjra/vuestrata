/**
 * How a failed request becomes an `AppError`.
 *
 * `normalizeError` classifies from the error alone. The API client knows two
 * more things about a failure, and this adds them:
 *
 *   - the signal the request ran under, which is the only reliable witness to
 *     a deliberate abort (a caller may abort with any reason at all, and the
 *     rejection is that reason, not an `AbortError`)
 *   - the response headers, which carry `Retry-After` and a request id the
 *     body may not repeat
 *
 * Framework-agnostic: nothing here knows about Vue, the router or the query
 * cache.
 */
import { AppError, normalizeError, transportError } from '~/lib/errors'

export interface FailureContext {
  /** The signal the caller passed with the request, if any. */
  signal?: AbortSignal | null
}

/**
 * The longest `Retry-After` the client honours. A server may ask for more;
 * the client then waits this long instead. An absurd or hostile value must not
 * park a query behind a timer for days, and a spinner held for minutes is worse
 * than an error the user can act on.
 */
const MAX_RETRY_AFTER_MS = 60_000

function responseOf(err: unknown): Response | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const response = (err as { response?: unknown }).response
  if (typeof response !== 'object' || response === null) return undefined
  const headers = (response as { headers?: { get?: unknown } }).headers
  return typeof headers?.get === 'function' ? (response as Response) : undefined
}

/** Whether a signal was aborted by a deadline (`AbortSignal.timeout()`) rather than by its owner. */
export function isTimeoutReason(reason: unknown): boolean {
  return (
    typeof reason === 'object' &&
    reason !== null &&
    (reason as { name?: unknown }).name === 'TimeoutError'
  )
}

/** Turn any failure of an API request into an `AppError`. */
export function toAppError(err: unknown, ctx: FailureContext = {}): AppError {
  if (err instanceof AppError) return err

  const response = responseOf(err)
  if (!response && ctx.signal?.aborted) {
    // `AbortSignal.timeout()` aborts with a TimeoutError: the caller set a
    // deadline, and missing it is a timeout, not a cancellation.
    return transportError(isTimeoutReason(ctx.signal.reason) ? 'timeout' : 'aborted')
  }

  const appError = normalizeError(err)
  if (!response) return appError

  const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
  const requestId = appError.requestId ?? response.headers.get('x-request-id') ?? undefined
  if (retryAfterMs === undefined && requestId === appError.requestId) return appError

  return appError.with({ requestId, retryAfterMs: retryAfterMs ?? appError.retryAfterMs })
}

/**
 * Read a `Retry-After` header as a delay in milliseconds.
 *
 * Both forms in RFC 9110 are accepted: delay-seconds (`120`) and an HTTP-date
 * (`Wed, 21 Oct 2026 07:28:00 GMT`), which is measured from `now`. A date in
 * the past means "now" (0). The result is capped at one minute — see
 * `MAX_RETRY_AFTER_MS`. Anything unparseable is `undefined`.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined

  let delayMs: number
  if (/^\d+$/.test(trimmed)) {
    delayMs = Number(trimmed) * 1000
  } else {
    // Every HTTP-date spells out its month. Requiring a letter stops
    // `Date.parse`, which reads `1.5` as a day in 2001, turning noise into a
    // date.
    const at = /[a-z]/i.test(trimmed) ? Date.parse(trimmed) : Number.NaN
    if (Number.isNaN(at)) return undefined
    delayMs = at - now
  }
  return Math.min(Math.max(delayMs, 0), MAX_RETRY_AFTER_MS)
}

/**
 * A URL that is safe to log: scheme, host and path, without credentials in
 * the authority, the query string or the fragment.
 *
 * The path is what identifies an endpoint for triage. The query is where user
 * data travels — search terms, email addresses, the occasional token — and it
 * has no business in a log line or an error report. Works on relative URLs.
 */
export function redactUrl(url: string): string {
  const end = url.search(/[?#]/)
  const withoutQuery = end === -1 ? url : url.slice(0, end)
  return withoutQuery.replace(/^([a-z][a-z\d+.-]*:\/\/)[^/@]*@/i, '$1')
}
