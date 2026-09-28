import { logger } from '~/lib/logger'
import type { ApiError } from '~/types'

import { reportError } from './reporter'

export {
  getErrorReporter,
  installErrorReporter,
  reportError,
  resetErrorReporter,
  setErrorReporterUser,
} from './reporter'
export type { ErrorReporter, ErrorReportContext } from './reporter'

/**
 * What failed, answered once at the boundary so no caller has to re-derive it
 * from a status code and an error message:
 *
 *   network  — no response at all: offline, DNS, CORS, a dropped connection
 *   timeout  — no response before the client's deadline
 *   aborted  — the app cancelled the request itself. Not a failure: never
 *              retried, never reported
 *   http     — the server answered with an error status
 *   contract — the server answered with a success whose body breaks the
 *              agreed shape
 *   unknown  — anything else: a bug, a thrown string
 */
export type AppErrorKind = 'network' | 'timeout' | 'aborted' | 'http' | 'contract' | 'unknown'

/**
 * The i18n keys `AppError.messageKey` can hold, besides `errors.status_<code>`
 * for the statuses `getStatusMessage` knows.
 *
 * A project's locale files translate these, so they are a contract: renaming
 * one silently puts that message back into English for every user.
 */
export const ERROR_MESSAGE_KEYS = {
  network: 'errors.network',
  timeout: 'errors.timeout',
  aborted: 'errors.aborted',
  sessionExpired: 'errors.session_expired',
  contract: 'errors.contract',
  server: 'errors.server',
  request: 'errors.request',
  unknown: 'errors.unknown',
} as const

export interface AppErrorOptions {
  message: string
  code?: string
  status?: number
  details?: Record<string, string[]>
  requestId?: string
  kind?: AppErrorKind
  retryable?: boolean
  retryAfterMs?: number
  messageKey?: string
  formErrors?: string[]
}

/** Normalized application error */
export class AppError extends Error {
  public readonly code: string
  public readonly status: number
  public readonly details?: Record<string, string[]>
  public readonly requestId?: string
  /** What failed. Absent on an error nothing has classified. */
  public readonly kind?: AppErrorKind
  /**
   * Whether sending the same request again could succeed. A property of the
   * failure, not a policy: whether anything actually retries is decided by
   * the caller (see `core/lib/api/retry.ts`).
   */
  public readonly retryable?: boolean
  /** How long the server asked the client to wait, from `Retry-After`. */
  public readonly retryAfterMs?: number
  /**
   * An i18n key for the user-facing text. `message` remains the English
   * fallback, so a caller without translations can still show something.
   */
  public readonly messageKey?: string
  /**
   * Reserved for form-level messages that belong to no single field. The
   * per-field ones are `details`.
   */
  public readonly formErrors?: string[]

  constructor(opts: AppErrorOptions) {
    super(opts.message)
    this.name = 'AppError'
    this.code = opts.code ?? 'UNKNOWN_ERROR'
    this.status = opts.status ?? 500
    this.details = opts.details
    this.requestId = opts.requestId
    this.kind = opts.kind
    this.retryable = opts.retryable
    this.retryAfterMs = opts.retryAfterMs
    this.messageKey = opts.messageKey
    this.formErrors = opts.formErrors
  }

  toApiError(): ApiError {
    return {
      status: this.status,
      code: this.code,
      message: this.message,
      details: this.details,
      requestId: this.requestId,
    }
  }
}

const SERVER_ERROR_MESSAGE = 'An unexpected error occurred. Please try again.'

/**
 * The error for a request that got no response.
 *
 * One constructor, so the API client and `normalizeError` cannot disagree
 * about the code, the message or whether it is worth retrying. `status` is 0,
 * the value fetch itself uses for "no HTTP status": the default of 500 would
 * make an offline laptop look like a server outage.
 */
export function transportError(kind: 'network' | 'timeout' | 'aborted'): AppError {
  switch (kind) {
    case 'network':
      return new AppError({
        message: 'Network error — please check your connection and try again.',
        code: 'NETWORK_ERROR',
        status: 0,
        kind,
        retryable: true,
        messageKey: ERROR_MESSAGE_KEYS.network,
      })
    case 'timeout':
      return new AppError({
        message: 'The server took too long to respond. Please try again.',
        code: 'TIMEOUT',
        status: 0,
        kind,
        retryable: true,
        messageKey: ERROR_MESSAGE_KEYS.timeout,
      })
    case 'aborted':
      return new AppError({
        message: 'The request was cancelled.',
        code: 'ABORTED',
        status: 0,
        kind,
        retryable: false,
        messageKey: ERROR_MESSAGE_KEYS.aborted,
      })
  }
}

/**
 * Statuses that describe a passing condition rather than a wrong request.
 *
 * 5xx is the server's own trouble and may clear, except 501 and 505, which
 * state a capability the server does not have. Every other 4xx means the
 * request itself is wrong, and sending it again gets the same answer.
 */
const RETRYABLE_CLIENT_STATUSES = new Set([408, 425, 429])

function isRetryableStatus(status: number): boolean {
  if (RETRYABLE_CLIENT_STATUSES.has(status)) return true
  return status >= 500 && status <= 599 && status !== 501 && status !== 505
}

function statusMessageKey(status: number): string {
  if (status in STATUS_MESSAGES) return `errors.status_${status}`
  return status >= 500 ? ERROR_MESSAGE_KEYS.server : ERROR_MESSAGE_KEYS.request
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nameOf(value: unknown): string | undefined {
  return isRecord(value) && typeof value.name === 'string' ? value.name : undefined
}

/**
 * Adapter for errors that carry an HTTP response. ofetch's `FetchError`
 * exposes it as `response` (with the parsed body as `data`); an ofetch-*shaped*
 * error — `data` plus `statusCode`/`status`, no response — is accepted too.
 * Returns `null` for anything else so the caller falls through.
 *
 * With `parseTransportError`, this is all that knows the HTTP client's error
 * format, so swapping clients only requires editing these two functions.
 */
function parseHttpError(err: Error): AppError | null {
  const fetchErr = err as Error & {
    response?: { status?: unknown }
    data?: unknown
    statusCode?: unknown
    status?: unknown
  }
  const responseStatus = fetchErr.response?.status
  const hasResponse = typeof responseStatus === 'number' && responseStatus >= 400
  const data = isRecord(fetchErr.data) ? fetchErr.data : undefined
  if (!hasResponse && !data) return null

  let status = 500
  if (hasResponse) status = responseStatus
  else if (typeof fetchErr.statusCode === 'number') status = fetchErr.statusCode
  else if (typeof fetchErr.status === 'number') status = fetchErr.status

  // Server-class errors must never forward the raw backend message — it
  // can embed stack traces, internal paths, or query strings. Client-
  // class errors keep the API message because it is the actionable
  // validation/authorization text users need. The fallback is never
  // `err.message`: ofetch writes the full request URL into it.
  const apiMessage = typeof data?.message === 'string' && data.message ? data.message : undefined
  return new AppError({
    message: status >= 500 ? SERVER_ERROR_MESSAGE : (apiMessage ?? getStatusMessage(status)),
    code: typeof data?.code === 'string' ? data.code : 'API_ERROR',
    status,
    details: isRecord(data?.details) ? (data.details as Record<string, string[]>) : undefined,
    requestId: typeof data?.requestId === 'string' ? data.requestId : undefined,
    kind: 'http',
    retryable: isRetryableStatus(status),
    messageKey: statusMessageKey(status),
  })
}

/**
 * Adapter for a request that never got a response. ofetch wraps the
 * rejection in a `FetchError` whose `cause` says why; native fetch rejects
 * with the cause itself. A `FetchError` that is neither an abort nor a
 * timeout is the network — its message would otherwise reach the user as
 * `[GET] "https://…/customers?search=…": <no response> Failed to fetch`.
 *
 * Matched by name, not `instanceof`: fetch rejects with whatever the signal
 * was aborted with, and a `DOMException` from another realm (an iframe, a
 * test DOM) is not an instance of this realm's `Error`.
 */
function parseTransportError(err: unknown): AppError | null {
  const name = nameOf(err)
  const reason = name === 'FetchError' ? nameOf((err as { cause?: unknown }).cause) : name
  if (reason === 'AbortError') return transportError('aborted')
  if (reason === 'TimeoutError') return transportError('timeout')
  return name === 'FetchError' ? transportError('network') : null
}

/** Normalize any thrown value into an AppError */
export function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) return err

  const failure = (err instanceof Error ? parseHttpError(err) : null) ?? parseTransportError(err)
  if (failure) return failure

  if (err instanceof Error) {
    const statusLike = err as Error & { statusCode?: number; status?: number }
    return new AppError({
      message: err.message,
      code: 'RUNTIME_ERROR',
      status: (statusLike.statusCode ?? statusLike.status) || 500,
      kind: 'unknown',
      messageKey: ERROR_MESSAGE_KEYS.unknown,
    })
  }

  if (typeof err === 'string') {
    return new AppError({
      message: err,
      code: 'STRING_ERROR',
      kind: 'unknown',
      messageKey: ERROR_MESSAGE_KEYS.unknown,
    })
  }

  return new AppError({
    message: 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR',
    kind: 'unknown',
    messageKey: ERROR_MESSAGE_KEYS.unknown,
  })
}

/**
 * Was this failure a 404?
 *
 * A missing record is a route-level condition, not a transient error: the page
 * must offer "back to the list" rather than "retry". Every record page needs
 * the distinction, and each one used to re-derive it from a locally cast
 * `{ status?, statusCode? }` shape — five copies of one rule, each free to
 * forget that ofetch reports the code under `statusCode`.
 *
 * `null`/`undefined` is not a 404: no error means nothing failed.
 */
export function isNotFoundError(err: unknown): boolean {
  if (err === null || err === undefined) return false
  return normalizeError(err).status === 404
}

/** HTTP status code to user-friendly message */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'The request was invalid. Please check your input.',
  401: 'You need to sign in to continue.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  409: 'A conflict occurred. The resource may have been modified.',
  422: 'Validation failed. Please check your input.',
  429: 'Too many requests. Please try again later.',
  500: 'An internal server error occurred. Please try again.',
  502: 'The server is temporarily unavailable. Please try again.',
  503: 'The service is undergoing maintenance. Please try again later.',
}

export function getStatusMessage(status: number): string {
  return STATUS_MESSAGES[status] ?? `An error occurred (status ${status}).`
}

/** Install global error handlers (call once in main.ts) */
export function installErrorHandlers(target: EventTarget = globalThis as EventTarget) {
  const errorLogger = logger.withTag('error-handler')

  target.addEventListener('unhandledrejection', ((event: PromiseRejectionEvent) => {
    event.preventDefault()
    const error = normalizeError(event.reason)
    // A request the app cancelled itself — a superseded search, a view that
    // unmounted mid-load — rejects like a failure but is not one. Nobody has
    // anything to fix, so it is neither logged nor reported.
    if (error.kind === 'aborted') return
    errorLogger.error('Unhandled promise rejection:', error.message, {
      code: error.code,
      status: error.status,
    })
    reportError(event.reason, {
      source: 'window:unhandledrejection',
      extra: { code: error.code, status: error.status },
    })
  }) as EventListener)

  target.addEventListener('error', ((event: ErrorEvent) => {
    errorLogger.error('Uncaught error:', event.message, {
      filename: event.filename,
      lineno: event.lineno,
    })
    reportError(event.error ?? new Error(event.message), {
      source: 'window:error',
      extra: { filename: event.filename, lineno: event.lineno },
    })
  }) as EventListener)
}
