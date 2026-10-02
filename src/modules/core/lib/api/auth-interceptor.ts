import { ofetch } from 'ofetch'

import { transportError } from '~/lib/errors'
import { createScopedLogger } from '~/lib/logger'
import { getApiAuthBackend, tryGetApiAuthBackend, type ApiAuthBackend } from '~/lib/runtime'

import type { ApiAuthProvider, ApiAuthTransport, ApiRefreshResult } from './types'

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
 *
 * Also a no-op when the request already carries `Authorization`. A caller that
 * set one chose that credential — a token for another audience, the fresh
 * token a session resume is probing with — and replacing it with the session's
 * token would send the wrong credential, possibly to a party that should never
 * see it.
 */
export function applyAuthHeaders(headers: Headers): void {
  if (getAuthTransport() === 'cookie') return
  if (headers.has('Authorization')) return

  const provider = tryGetApiAuthBackend()?.getProvider() ?? null
  const token = provider?.getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
}

/**
 * Attempt to refresh the access token after a 401 response.
 * Returns true if refresh succeeded and headers were updated for retry.
 *
 * `options.headers` comes back carrying the new bearer token; the API client
 * replays the original request with them, once.
 *
 * Rejects with an `aborted` error when the session ended (`resetAuthInterceptor`)
 * while the refresh was out. False would tell the client the session expired.
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

  // This rejects when the session ended while the refresh was out: the request
  // belongs to nobody now, and reporting an expiry for it would end whichever
  // session has started since.
  const newToken = await (backend.getRefreshPromise() ?? startRefresh(backend, baseURL))
  if (newToken) {
    backend.setLastRefreshedAt(Date.now())
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${newToken}`)
    options.headers = headers
    return true
  }

  return false
}

/**
 * Start the one refresh every 401 of this session shares.
 *
 * The backend's slot is what ties a refresh to a session: `resetAuthInterceptor`
 * empties it when the session ends, and a refresh that finds the slot no longer
 * holding it knows its answer is for somebody who has left. Without that check
 * a refresh that outlived a sign-out wrote its token onto the next person's
 * session, cleared that session when it failed, and emptied the slot under
 * the refresh the new session had started, so a third request began a second
 * one beside it.
 */
function startRefresh(backend: ApiAuthBackend, baseURL: string): Promise<string | null> {
  const flight: { promise: Promise<string | null> | null } = { promise: null }
  const isCurrent = () => backend.getRefreshPromise() === flight.promise
  flight.promise = refreshAccessToken(baseURL, isCurrent).finally(() => {
    if (isCurrent()) backend.setRefreshPromise(null)
  })
  backend.setRefreshPromise(flight.promise)
  return flight.promise
}

/** Notify that the session has expired — the auth provider decides the action. */
export function notifySessionExpired(): void {
  authLogger.warn('Session expired')
  tryGetApiAuthBackend()?.getProvider()?.onSessionExpired?.()
}

/** The HTTP status carried by a failed request, whichever client raised it. */
function statusOf(error: unknown): number | undefined {
  const carrier = error as { status?: unknown; response?: { status?: unknown } } | null
  const status = carrier?.status ?? carrier?.response?.status
  return typeof status === 'number' ? status : undefined
}

/**
 * The request `refreshAccessToken` retries, or `null` when there is nothing to
 * refresh with.
 *
 * A provider that implements `refresh()` owns the whole request. One that does
 * not gets the legacy shape: `{ refreshToken }` in the body, which needs a
 * JavaScript-held token. That is the only path a project with an old provider
 * has, so it stays exactly as it was.
 */
function refreshRequestFor(
  provider: ApiAuthProvider,
  baseURL: string,
): (() => Promise<ApiRefreshResult | null>) | null {
  if (typeof provider.refresh === 'function') {
    if (typeof provider.canRefresh === 'function' && !provider.canRefresh()) return null
    return () => provider.refresh!()
  }

  const refreshToken = provider.getRefreshToken()
  if (!refreshToken) return null

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

  return () =>
    ofetch<ApiRefreshResult>(refreshUrl, {
      method: 'POST',
      body: { refreshToken },
      credentials,
      headers,
    })
}

/**
 * @param isCurrent Whether the session this refresh was started for is still
 *   the one in progress. Asked after every wait; once it is not, the refresh
 *   rejects without touching the provider, as a request the app abandoned.
 */
async function refreshAccessToken(
  baseURL: string,
  isCurrent: () => boolean,
): Promise<string | null> {
  const provider = tryGetApiAuthBackend()?.getProvider()
  if (!provider) return null
  const request = refreshRequestFor(provider, baseURL)
  if (!request) return null

  const refreshLogger = createScopedLogger('auth-refresh')
  const maxRetries = 2
  const abandon = (): never => {
    refreshLogger.info('The session ended during a refresh, discarding its answer')
    throw transportError('aborted')
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: ApiRefreshResult | null
    try {
      res = await request()
    } catch (err) {
      if (!isCurrent()) abandon()
      // The backend answered, and the answer was no: the refresh credential is
      // spent or revoked, and asking again only delays the sign-in page.
      const status = statusOf(err)
      if (status === 401 || status === 403) {
        refreshLogger.warn('Refresh credential rejected, clearing auth', { status })
        provider.clearAuth()
        return null
      }
      refreshLogger.warn(`Refresh attempt ${attempt + 1}/${maxRetries + 1} failed`, { error: err })
      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1000ms
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
        if (!isCurrent()) abandon()
      }
      continue
    }

    if (!isCurrent()) abandon()
    // `null` is the provider saying it had nothing to present. That is not a
    // failed attempt to repeat; the session-expired path takes it from here.
    if (!res?.token) {
      refreshLogger.warn('Refresh returned no access token')
      return null
    }
    try {
      // An empty string, not undefined: `setAuth`'s second parameter predates
      // providers whose refresh credential never reaches JavaScript.
      provider.setAuth(res.token, res.refreshToken ?? '', res.expiresIn)
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
  }

  refreshLogger.error('All refresh attempts exhausted, clearing auth')
  provider.clearAuth()
  return null
}
