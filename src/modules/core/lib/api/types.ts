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
  setAuth: (token: string, refreshToken: string) => void
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
}
