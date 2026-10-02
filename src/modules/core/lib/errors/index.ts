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
export { parseVueErrorInfo } from './vue-error-info'
export type { VueErrorCode, VueErrorInfo } from './vue-error-info'

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
  unexpectedResponse: 'errors.unexpected_response',
  csrf: 'errors.csrf',
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
  serverMessage?: string
}

/**
 * What an error mapper read out of a failed response's body. Every field is
 * optional: a mapper reports what it recognised and leaves the rest to the
 * defaults for the status.
 *
 * `details` is keyed by the backend's own field path, exactly as it sent it
 * (`contact_name`, `Address.City`, `items.0.qty`). Nothing here renames a key:
 * matching them to form fields is the form layer's job, and it can only do
 * that from the original.
 */
export interface MappedError {
  /** The backend's message for the user. Dropped for a 5xx. */
  message?: string
  /** A machine-readable code, when the backend sends one. */
  code?: string
  /** Messages per field. */
  details?: Record<string, string[]>
  /** Messages that belong to the whole request rather than to one field. */
  formErrors?: string[]
  /** The id the backend logged this request under. */
  requestId?: string
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
   * Form-level messages that belong to no single field (DRF's
   * `non_field_errors`, a model-level error from ASP.NET). The per-field ones
   * are `details`.
   */
  public readonly formErrors?: string[]
  /**
   * The backend's own message for a 4xx, when it sent one. Set only then: it
   * is what tells `describeError` that `message` is the server speaking, which
   * is more specific than any translation of the status, rather than the
   * English fallback this file supplies.
   */
  public readonly serverMessage?: string

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
    this.serverMessage = opts.serverMessage
  }

  /** A copy with some fields replaced. The original is never modified. */
  with(patch: Partial<AppErrorOptions>): AppError {
    return new AppError({
      message: this.message,
      code: this.code,
      status: this.status,
      details: this.details,
      requestId: this.requestId,
      kind: this.kind,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      messageKey: this.messageKey,
      formErrors: this.formErrors,
      serverMessage: this.serverMessage,
      ...patch,
    })
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

  return httpError(status, readErrorBody(data))
}

/**
 * Read Vuestrata's own error body: `{ message, code, details, requestId }`.
 *
 * The one place that knows the shape. `normalizeError` uses it for an error
 * raised outside the API client, and the client's built-in mapper
 * (`core/lib/api/error-mappers.ts`) for one raised inside it, so the two
 * cannot read the same body differently.
 */
export function readErrorBody(body: unknown): MappedError {
  const data = isRecord(body) ? body : undefined
  return {
    message: typeof data?.message === 'string' && data.message ? data.message : undefined,
    code: typeof data?.code === 'string' ? data.code : undefined,
    details: isRecord(data?.details) ? (data.details as Record<string, string[]>) : undefined,
    requestId: typeof data?.requestId === 'string' ? data.requestId : undefined,
  }
}

/** What the API client knows about a failed response beyond its body. */
export interface HttpErrorContext {
  /** From the `Retry-After` header. */
  retryAfterMs?: number
  /** Replaces the key derived from the status. */
  messageKey?: string
  /** The code to use when the body carried none. Defaults to `API_ERROR`. */
  fallbackCode?: string
}

/**
 * The error for a response with an error status.
 *
 * One constructor, so `normalizeError` and the API client cannot disagree
 * about what a status means: whether it is worth retrying, which i18n key it
 * maps to, and what of the body may reach a user.
 *
 * Server-class errors must never forward the raw backend message — it can
 * embed stack traces, internal paths, or query strings — nor its form-level
 * messages, which are the same text under another name. Client-class errors
 * keep the API message because it is the actionable validation/authorization
 * text users need. The fallback is never the HTTP client's own message: ofetch
 * writes the full request URL into it.
 */
export function httpError(
  status: number,
  mapped: MappedError | null = null,
  context: HttpErrorContext = {},
): AppError {
  const isServerError = status >= 500
  const serverMessage = !isServerError && mapped?.message ? mapped.message : undefined
  return new AppError({
    message: isServerError ? SERVER_ERROR_MESSAGE : (serverMessage ?? getStatusMessage(status)),
    code: mapped?.code ?? context.fallbackCode ?? 'API_ERROR',
    status,
    details: mapped?.details,
    requestId: mapped?.requestId,
    kind: 'http',
    retryable: isRetryableStatus(status),
    retryAfterMs: context.retryAfterMs,
    messageKey: context.messageKey ?? statusMessageKey(status),
    formErrors: isServerError || !mapped?.formErrors?.length ? undefined : mapped.formErrors,
    serverMessage,
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

/**
 * Every i18n key an `AppError.messageKey` can hold: the named ones, and one
 * per status `getStatusMessage` has a message for.
 *
 * A locale catalog must define all of them, and a test holds the shipped ones
 * to that. The alternative is a key nobody notices is missing until a French
 * user reads `errors.status_409` on their screen.
 */
export function listErrorMessageKeys(): string[] {
  return [
    ...Object.values(ERROR_MESSAGE_KEYS),
    ...Object.keys(STATUS_MESSAGES).map((status) => `errors.status_${status}`),
  ]
}

/** Turns an i18n key into its text. vue-i18n's `t` is one. */
export type TranslateFn = (key: string) => string

/**
 * The one line to show a user for a failure, in their language.
 *
 * In order: what the backend said about a request it refused (a 4xx: "That
 * email is already registered" beats any translation of "422"), then the
 * translation of the error's `messageKey`, then its English `message`.
 *
 * Framework-agnostic: it takes the translate function instead of importing an
 * i18n library. `useErrorMessage()` in the app layer binds it to vue-i18n.
 *
 * A backend that localizes its messages is sent the request's
 * `Accept-Language` by the API client, so the first case is in the user's
 * language too.
 */
export function describeError(err: unknown, t: TranslateFn): string {
  const error = normalizeError(err)
  if (error.serverMessage) return error.serverMessage
  if (error.messageKey) {
    const translated = t(error.messageKey)
    // A translate function answers with the key itself when it has no entry.
    if (translated && translated !== error.messageKey) return translated
  }
  return error.message
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
