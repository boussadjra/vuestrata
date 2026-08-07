/**
 * PKCE handshake state, persisted across the provider redirect.
 *
 * sessionStorage rather than localStorage: the state is scoped to one tab's
 * one login attempt, and must not outlive the tab or leak into a sibling one.
 */

export const OAUTH_STATE_KEY = 'vuestrata-oauth-state'
export const OAUTH_VERIFIER_KEY = 'vuestrata-oauth-verifier'
export const OAUTH_STATE_TS_KEY = 'vuestrata-oauth-state-ts'

/**
 * PKCE state is a one-shot nonce. A short lifetime stops a stale sessionStorage
 * entry from a previous abandoned attempt being replayed against a new callback.
 */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

export function persistPkceState(state: string, codeVerifier: string): void {
  sessionStorage.setItem(OAUTH_STATE_KEY, state)
  sessionStorage.setItem(OAUTH_VERIFIER_KEY, codeVerifier)
  sessionStorage.setItem(OAUTH_STATE_TS_KEY, String(Date.now()))
}

export function readPkceState(): {
  state: string | null
  verifier: string | null
  issuedAt: number
} {
  const rawTimestamp = sessionStorage.getItem(OAUTH_STATE_TS_KEY)
  return {
    state: sessionStorage.getItem(OAUTH_STATE_KEY),
    verifier: sessionStorage.getItem(OAUTH_VERIFIER_KEY),
    issuedAt: rawTimestamp ? Number(rawTimestamp) : Number.NaN,
  }
}

export function clearPkceState(): void {
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(OAUTH_VERIFIER_KEY)
  sessionStorage.removeItem(OAUTH_STATE_TS_KEY)
}
