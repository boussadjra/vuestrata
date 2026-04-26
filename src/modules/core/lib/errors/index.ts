import { logger } from '~/lib/logger'
import type { ApiError } from '~/types'

/** Normalized application error */
export class AppError extends Error {
  public readonly code: string
  public readonly status: number
  public readonly details?: Record<string, string[]>
  public readonly requestId?: string

  constructor(opts: {
    message: string
    code?: string
    status?: number
    details?: Record<string, string[]>
    requestId?: string
  }) {
    super(opts.message)
    this.name = 'AppError'
    this.code = opts.code ?? 'UNKNOWN_ERROR'
    this.status = opts.status ?? 500
    this.details = opts.details
    this.requestId = opts.requestId
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

/**
 * Adapter for ofetch-style errors. Returns an `AppError` if `err` is
 * recognised as a fetch error (carries `data` plus a `status`/`statusCode`),
 * or `null` so callers can fall through to the next adapter. Kept tightly
 * scoped so swapping HTTP clients only requires editing this function.
 */
function parseFetchError(err: Error): AppError | null {
  const fetchErr = err as Error & {
    data?: ApiError
    statusCode?: number
    status?: number
  }
  if (!fetchErr.data || typeof fetchErr.data !== 'object') return null
  const status = fetchErr.statusCode ?? fetchErr.status ?? 500
  // Server-class errors must never forward the raw backend message — it
  // can embed stack traces, internal paths, or query strings. Client-
  // class errors keep the API message because it is the actionable
  // validation/authorization text users need.
  const safeMessage =
    status >= 500
      ? 'An unexpected error occurred. Please try again.'
      : (fetchErr.data.message ?? err.message)
  return new AppError({
    message: safeMessage,
    code: fetchErr.data.code ?? 'API_ERROR',
    status,
    details: fetchErr.data.details,
    requestId: fetchErr.data.requestId,
  })
}

/** Normalize any thrown value into an AppError */
export function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) return err

  if (err instanceof Error) {
    const fetchErr = parseFetchError(err)
    if (fetchErr) return fetchErr

    const statusLike = err as Error & { statusCode?: number; status?: number }
    return new AppError({
      message: err.message,
      code: 'RUNTIME_ERROR',
      status: (statusLike.statusCode ?? statusLike.status) || 500,
    })
  }

  if (typeof err === 'string') {
    return new AppError({ message: err, code: 'STRING_ERROR' })
  }

  return new AppError({
    message: 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR',
  })
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
    errorLogger.error('Unhandled promise rejection:', error.message, {
      code: error.code,
      status: error.status,
    })
  }) as EventListener)

  target.addEventListener('error', ((event: ErrorEvent) => {
    errorLogger.error('Uncaught error:', event.message, {
      filename: event.filename,
      lineno: event.lineno,
    })
  }) as EventListener)
}
