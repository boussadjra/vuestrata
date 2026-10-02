/**
 * How the configured auth adapter proves identity. Mirrors `AuthTransport` in
 * the auth module; duplicated here so `core/lib` does not depend on a feature
 * module. `main.ts` passes the adapter's value through at bootstrap.
 *
 *   bearer — send `Authorization: Bearer`, do NOT send cookies, no CSRF header.
 *   cookie — send cookies, do NOT send `Authorization`, add `X-CSRF-Token` to
 *            state-changing requests.
 */
export type ApiAuthTransport = 'bearer' | 'cookie'

/**
 * What a provider's `refresh()` resolves to. `refreshToken` is absent when the
 * backend keeps that credential in an HttpOnly cookie and never puts it in the
 * body; `expiresIn` is the new access token's lifetime in seconds.
 */
export interface ApiRefreshResult {
  token: string
  refreshToken?: string
  expiresIn?: number
}

export interface ApiAuthProvider {
  /**
   * Defaults to 'bearer' when omitted. Sending both an ambient cookie and a
   * bearer token — which is what the client did unconditionally before — means
   * a bearer API receives credentials it never asked for, and a cookie API
   * receives a header that bypasses its CSRF assumptions.
   */
  transport?: ApiAuthTransport
  getToken: () => string | null
  getRefreshToken: () => string | null
  /**
   * Store a refreshed session. `refreshToken` is an empty string when the
   * backend sent none (an HttpOnly-cookie session): keep the one held, if any.
   * `expiresIn` lets the store reschedule its proactive refresh.
   */
  setAuth: (token: string, refreshToken: string, expiresIn?: number) => void
  clearAuth: () => void
  /**
   * Current CSRF token, used by the refresh request under the cookie
   * transport. Optional because bearer deployments have no CSRF token.
   */
  getCsrfToken?: () => string | null
  /** Called when token refresh fails and the session is no longer valid */
  onSessionExpired?: () => void
  /**
   * Path (relative to the API base URL) that the interceptor POSTs to in
   * order to refresh the access token. Defaults to `/auth/refresh` when not
   * provided so existing wiring keeps working.
   */
  refreshEndpoint?: string
  /**
   * Mint a new access token. When present the interceptor calls this instead
   * of POSTing `{ refreshToken }` itself, so the adapter owns what the request
   * looks like: which credential it presents (a body token, or an HttpOnly
   * cookie with no body at all), the endpoint, and the credentials mode.
   * Resolves to `null` when there is nothing to refresh with; a rejection is a
   * failed attempt and is retried like the legacy path.
   *
   * Optional: a provider without it keeps the body-token behaviour, which needs
   * `getRefreshToken()` to return something.
   */
  refresh?: () => Promise<ApiRefreshResult | null>
  /**
   * Whether `refresh()` has a credential to present right now. Checked before
   * every refresh. Omitted means "just call `refresh()`".
   */
  canRefresh?: () => boolean
}
