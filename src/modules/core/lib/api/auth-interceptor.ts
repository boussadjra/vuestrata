import { ofetch } from 'ofetch'

import { createScopedLogger } from '~/lib/logger'
import { getApiAuthBackend, tryGetApiAuthBackend } from '~/lib/runtime'

import type { ApiAuthProvider, ApiAuthTransport } from './types'

const authLogger = createScopedLogger('api:auth')

const REFRESH_COOLDOWN_MS = 5_000

/** Call once at app startup to wire auth into the API client. */
export function installApiAuth(provider: ApiAuthProvider) {
  getApiAuthBackend().setProvider(provider)
}

/**
 * Reset the interceptor's transient state. Call from the auth layer when
 * the session is cleared (logout, forced 401) so a brand-new login does not
 * inherit the previous session's refresh-cooldown window or a stale
 * in-flight refresh promise.
 */
export function resetAuthInterceptor(): void {
  tryGetApiAuthBackend()?.resetTransient()
}

/** The configured transport, defaulting to bearer when nothing is installed. */
export function getAuthTransport(): ApiAuthTransport {
  return tryGetApiAuthBackend()?.getProvider()?.transport ?? 'bearer'
}

/**
 * Inject the current auth token into request headers.
 *
 * No-op under the cookie transport: the browser attaches the session cookie
 * itself, and an `Authorization` header there would be a second, unasked-for
 * credential — at best ignored, at worst routed down a different code path on
 * the backend than the one that enforces CSRF.
 */
export function applyAuthHeaders(headers: Headers): void {
  if (getAuthTransport() === 'cookie') return

  const provider = tryGetApiAuthBackend()?.getProvider() ?? null
  const token = provider?.getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
}

/**
 * Attempt to refresh the access token after a 401 response.
 * Returns true if refresh succeeded and headers were updated for retry.
 */
export async function handleTokenRefresh(
  baseURL: string,
  options: { headers?: HeadersInit },
): Promise<boolean> {
  const backend = tryGetApiAuthBackend()
  if (!backend) return false
  const provider = backend.getProvider()

  // Within the cooldown window, assume the token the provider is currently
  // holding is already the freshly-refreshed one and just re-apply it.
  if (Date.now() - backend.getLastRefreshedAt() < REFRESH_COOLDOWN_MS) {
    const token = provider?.getToken()
    if (token) {
      const headers = new Headers(options.headers)
      headers.set('Authorization', `Bearer ${token}`)
      options.headers = headers
      return true
    }
  }

  let pending = backend.getRefreshPromise()
  if (!pending) {
    pending = refreshAccessToken(baseURL).finally(() => {
      backend.setRefreshPromise(null)
    })
    backend.setRefreshPromise(pending)
  }

  const newToken = await pending
  if (newToken) {
    backend.setLastRefreshedAt(Date.now())
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${newToken}`)
    options.headers = headers
    return true
  }

  return false
}

/** Notify that the session has expired — the auth provider decides the action. */
export function notifySessionExpired(): void {
  authLogger.warn('Session expired')
  tryGetApiAuthBackend()?.getProvider()?.onSessionExpired?.()
}

async function refreshAccessToken(baseURL: string): Promise<string | null> {
  const provider = tryGetApiAuthBackend()?.getProvider()
  if (!provider) return null
  const refreshToken = provider.getRefreshToken()
  if (!refreshToken) return null

  const refreshLogger = createScopedLogger('auth-refresh')
  const maxRetries = 2
  const endpoint = provider.refreshEndpoint ?? '/auth/refresh'
  const refreshUrl = `${baseURL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
  const transport = getAuthTransport()

  // This call deliberately uses bare `ofetch` rather than `apiFetch`: routing
  // it through the configured client would re-enter this same interceptor on a
  // 401 and recurse. The transport-dependent request options that `apiFetch`
  // would have applied are therefore reproduced here — previously they were
  // simply missing, so the refresh request carried neither cookies nor a CSRF
  // header and failed against any cookie-session backend.
  const credentials: RequestCredentials = transport === 'cookie' ? 'include' : 'omit'
  const headers = new Headers()
  if (transport === 'cookie') {
    const csrfToken = provider.getCsrfToken?.() ?? null
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await ofetch<{
        token: string
        refreshToken: string
        expiresIn: number
      }>(refreshUrl, {
        method: 'POST',
        body: { refreshToken },
        credentials,
        headers,
      })
      try {
        provider.setAuth(res.token, res.refreshToken)
      } catch (persistErr) {
        // A failure here (localStorage quota, JSON serialization, store
        // teardown mid-flight) must not leave the caller believing the
        // refresh succeeded — bail out so they trigger the expired-session
        // path instead.
        refreshLogger.error('Failed to persist refreshed tokens', { error: persistErr })
        return null
      }
      refreshLogger.info('Token refreshed successfully')
      return res.token
    } catch (err) {
      refreshLogger.warn(`Refresh attempt ${attempt + 1}/${maxRetries + 1} failed`, { error: err })
      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1000ms
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
      }
    }
  }

  refreshLogger.error('All refresh attempts exhausted, clearing auth')
  provider.clearAuth()
  return null
}
