export interface ApiAuthProvider {
  getToken: () => string | null
  getRefreshToken: () => string | null
  setAuth: (token: string, refreshToken: string) => void
  clearAuth: () => void
  /** Called when token refresh fails and the session is no longer valid */
  onSessionExpired?: () => void
  /**
   * Path (relative to the API base URL) that the interceptor POSTs to in
   * order to refresh the access token. Defaults to `/auth/refresh` when not
   * provided so existing wiring keeps working.
   */
  refreshEndpoint?: string
}
