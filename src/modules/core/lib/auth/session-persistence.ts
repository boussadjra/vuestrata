/**
 * Refresh-token persistence for bearer sessions.
 *
 * Access tokens are NEVER written here. They are short-lived, they are already
 * held in memory by the auth store, and persisting one would widen the XSS
 * blast radius for no benefit — a stolen access token that expires in minutes
 * is worth far less than the refresh token that mints new ones. Only the
 * refresh token is a candidate, and only when the deployment has explicitly
 * opted in via `VUESTRATA_SESSION_PERSISTENCE`.
 *
 * Under `none` and `refresh-cookie` every function here is a no-op:
 *   - `none` keeps the pre-existing behaviour (a reload ends the session),
 *     now as a deliberate choice rather than an accident.
 *   - `refresh-cookie` puts the credential in an HttpOnly cookie the browser
 *     owns, so there is nothing for JavaScript to store.
 *
 * Lives in `core/lib` rather than the auth module because the app-level auth
 * store writes to it and the auth adapters read from it. Putting it in
 * `src/modules/auth` would make the store import the auth barrel, which
 * already imports the store — a cycle.
 */
import { runtimeEnv } from '../config'
import type { SessionPersistence } from '../config/env.schema'
import { createScopedLogger } from '../logger'

const persistenceLogger = createScopedLogger('session-persistence')

/**
 * Deliberately distinct from the theme/locale preference keys: this one holds
 * a credential, and anything clearing app preferences must not silently take
 * the session with it.
 */
const REFRESH_TOKEN_KEY = 'vuestrata-refresh-token'

/** The configured mode. Read through a function so tests can stub the module. */
export function sessionPersistenceMode(): SessionPersistence {
  return runtimeEnv.sessionPersistence
}

/**
 * The Web Storage area for the configured mode, or null when the mode does not
 * use Web Storage at all.
 *
 * Returns null rather than throwing when storage is unavailable — Safari's
 * private mode, an embedded webview with storage disabled, and a user who has
 * blocked site data all make these getters throw on ACCESS, not just on write.
 */
function storageArea(): Storage | null {
  const mode = sessionPersistenceMode()
  if (mode !== 'session' && mode !== 'local') return null
  if (typeof window === 'undefined') return null

  try {
    return mode === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    persistenceLogger.warn(
      `\`${mode}\` persistence is configured but Web Storage is unavailable in this browser. ` +
        `Sessions will not survive a reload.`,
    )
    return null
  }
}

/** True when the configured mode keeps a refresh token readable by JavaScript. */
export function usesWebStorage(): boolean {
  const mode = sessionPersistenceMode()
  return mode === 'session' || mode === 'local'
}

/** True when the app should try to resume a session from an HttpOnly cookie. */
export function usesRefreshCookie(): boolean {
  return sessionPersistenceMode() === 'refresh-cookie'
}

/**
 * True when a bearer session is expected to survive a reload by some means.
 * `false` means a refresh deliberately ends the session.
 */
export function persistsAcrossReload(): boolean {
  return sessionPersistenceMode() !== 'none'
}

/** The persisted refresh token, or null when there is none or storage is off. */
export function readPersistedRefreshToken(): string | null {
  const area = storageArea()
  if (!area) return null
  try {
    const value = area.getItem(REFRESH_TOKEN_KEY)
    return value && value.length > 0 ? value : null
  } catch {
    return null
  }
}

/**
 * Persist (or with `null`, remove) the refresh token.
 *
 * A quota or security failure is logged and swallowed: losing reload survival
 * degrades the experience, but throwing here would break a login that has
 * otherwise fully succeeded.
 */
export function persistRefreshToken(refreshToken: string | null): void {
  const area = storageArea()
  if (!area) return
  try {
    if (refreshToken) {
      area.setItem(REFRESH_TOKEN_KEY, refreshToken)
    } else {
      area.removeItem(REFRESH_TOKEN_KEY)
    }
  } catch (err) {
    persistenceLogger.warn('Could not write the refresh token to Web Storage', { err })
  }
}

/**
 * Remove any persisted refresh token.
 *
 * Unlike the other functions this ignores the configured mode and clears BOTH
 * storage areas. A deployment that switches from `local` to `none` must not
 * leave a live refresh token sitting in every existing user's browser forever,
 * and logout has to be able to clean up a token written under a previous
 * configuration.
 */
export function clearPersistedRefreshToken(): void {
  if (typeof window === 'undefined') return
  for (const area of [window.sessionStorage, window.localStorage]) {
    try {
      area?.removeItem(REFRESH_TOKEN_KEY)
    } catch {
      // Unavailable storage has nothing to clear.
    }
  }
}
