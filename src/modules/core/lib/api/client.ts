import { ofetch, type FetchOptions } from 'ofetch'

import { AppError } from '~/lib/errors'
import { createScopedLogger } from '~/lib/logger'
import { tryGetApiAuthBackend } from '~/lib/runtime'

import { applyAuthHeaders, handleTokenRefresh, notifySessionExpired } from './auth-interceptor'

export { installApiAuth, resetAuthInterceptor } from './auth-interceptor'
export type { ApiAuthProvider } from './types'
type ApiRequestOptions = Omit<FetchOptions<'json'>, 'method' | 'body'>
// import.meta.env.VUESTRATA_API_URL may be a relative path like '/api'.
// In Node (tests) a relative base breaks URL resolution inside ofetch
// (new URL requires an absolute base). Normalize to an absolute URL
// using the current origin in browser environments or fallback to
// http://localhost during tests/Node.
const _rawBaseURL = import.meta.env.VUESTRATA_API_URL || '/api'
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

/**
 * Default automatic retry only fires for safe, idempotent methods.
 * Retrying POST/PUT/PATCH/DELETE on transient failures can duplicate side
 * effects (double charges, double deletes). Callers that know an endpoint is
 * idempotent can opt-in via per-request `retry`/`retryStatusCodes` overrides.
 */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const apiFetch = ofetch.create({
  baseURL,
  retry: 3,
  retryDelay: 1000,
  retryStatusCodes: [408, 425, 429, 500, 502, 503, 504],
  // Hard upper bound so a hung backend cannot keep a user-facing request
  // pending indefinitely; individual callers can still override if needed.
  timeout: 15_000,
  credentials: 'include',

  onRequest({ options }) {
    const headers = new Headers(options.headers as HeadersInit)
    applyAuthHeaders(headers)

    const method = (options.method ?? 'GET').toUpperCase()
    const isMutating = !IDEMPOTENT_METHODS.has(method)

    // Mutating requests need CSRF protection. If our cached value is null
    // (e.g. the meta tag was injected after first read on a slow hydration),
    // drop the cache and read once more before giving up — null-caching the
    // first miss permanently would silently break every state-changing call.
    let csrfToken = getCsrfToken()
    if (!csrfToken && isMutating) {
      invalidateCsrfToken()
      csrfToken = getCsrfToken()
    }
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken)
    }
    options.headers = headers

    // Disable automatic retries for non-idempotent methods unless the caller
    // explicitly opted in by passing a `retry` option.
    if (options.retry === undefined && isMutating) {
      options.retry = 0
    }
  },

  async onResponseError({ request, response, options }) {
    const status = response.status
    const requestUrl = typeof request === 'string' ? request : request.url

    if (status === 401 && !requestUrl.includes('/auth/')) {
      const refreshed = await handleTokenRefresh(baseURL, options)
      if (refreshed) return
      notifySessionExpired()
      return
    }

    // CSRF token may have rotated; drop the cache so the next request reads
    // the new value from <meta>.
    if (status === 403) {
      invalidateCsrfToken()
    }

    // Do NOT log the response body by default \u2014 it frequently contains PII,
    // tokens, or stack traces from the backend. A structured summary is enough
    // for triage; use devtools/network panel for payload inspection.
    apiLogger.error(`API error ${status}`, {
      url: requestUrl,
      code: (response._data as { code?: string } | undefined)?.code,
      requestId: (response._data as { requestId?: string } | undefined)?.requestId,
    })

    const isNetworkError = status === 0 || !status
    // For server errors, never forward the raw backend message to the UI \u2014
    // it can leak stack traces, query strings, or internal paths. Reserve the
    // API-provided message for client-class errors (4xx) where it is safe and
    // actionable (e.g. validation details).
    const serverMessage = (response._data as { message?: string } | undefined)?.message
    let message: string
    if (isNetworkError) {
      message = 'Network error \u2014 please check your connection and try again.'
    } else if (status >= 500) {
      message = 'An unexpected error occurred. Please try again.'
    } else {
      message = serverMessage ?? `Request failed with status ${status}`
    }

    throw new AppError({
      message,
      code: isNetworkError ? 'NETWORK_ERROR' : (response._data?.code ?? 'API_ERROR'),
      status,
      details: response._data?.details,
      requestId: response._data?.requestId,
    })
  },
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
