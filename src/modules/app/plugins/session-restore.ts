/**
 * Session recovery at boot, as a dependency-injected function.
 *
 * This logic lived inline in `main.ts`, where nothing could reach it, and it
 * was wrong in a way no test could have caught: it opened with
 * `if (!authStore.token) return`. Tokens are held in memory, so on a cold boot
 * there is never a token at that point — the check made the entire function
 * unreachable for both real adapters, and every reload signed the user out.
 * Under cookie transport the session cookie was still valid and the app simply
 * never asked.
 *
 * Extracted here for the same reason `route-guard.ts` was: it is the kind of
 * decision that must be testable without booting an application. `main.ts`
 * supplies the real dependencies; tests supply fakes.
 */
import { normalizeError } from '~/lib/errors'
import { createScopedLogger } from '~/lib/logger'
import type { User } from '~/types'

const restoreLogger = createScopedLogger('session-restore')

/** What a resumed session looks like, mirroring the auth adapter contract. */
export interface RestorableSession {
  user: User
  /** Absent under cookie transport — the credential is an HttpOnly cookie. */
  token?: string
  refreshToken?: string
  expiresIn?: number
}

/**
 * The slice of the auth store this needs. A structural type rather than the
 * store itself keeps this module free of Pinia, so a test can pass a plain
 * object.
 */
export interface SessionRestoreStore {
  readonly token: string | null
  setAuth: (user: User, token: string, refreshToken?: string, expiresIn?: number) => void
  setUser: (user: User) => void
  clearAuth: () => void
}

export interface SessionRestoreDeps {
  store: SessionRestoreStore
  /** Refresh the user record for a session that is already in memory. */
  getUser: () => Promise<User | null>
  /**
   * Recover a session after a reload. Absent when the adapter cannot resume,
   * which is treated exactly like "nothing to resume".
   */
  resumeSession?: () => Promise<RestorableSession | null>
  /**
   * Demo-only IndexedDB restore. Supplied by `main.ts` only when this is a
   * demo build running the mock adapter; its presence IS the demo branch, so
   * this module needs no build-mode constant of its own.
   */
  loadDemoSession?: () => Promise<RestorableSession | null>
}

export async function restoreSession(deps: SessionRestoreDeps): Promise<void> {
  const { store } = deps

  if (deps.loadDemoSession) {
    const session = await deps.loadDemoSession()
    if (session?.token) {
      store.setAuth(session.user, session.token, session.refreshToken, session.expiresIn)
    }
    return
  }

  // A token already in memory means this is a re-entry, not a cold boot; only
  // the user record needs refreshing.
  if (store.token) {
    await refreshCurrentUser(deps)
    return
  }

  // Cold boot. `resumeSession` answers null for "nothing to resume" and
  // swallows its own transport failures, so there is no error path here — a
  // signed-out visitor is the common case, not an exception.
  const resumed = await deps.resumeSession?.()
  if (!resumed) return

  if (resumed.token) {
    store.setAuth(resumed.user, resumed.token, resumed.refreshToken, resumed.expiresIn)
  } else {
    // Cookie transport: the credential is an HttpOnly cookie, so there is no
    // token to store and no refresh to schedule — the backend renews it.
    store.setUser(resumed.user)
  }
}

/**
 * Re-read the current user for a session that survived in memory.
 *
 * Only a hard credential failure (401/403) clears the session. A transient
 * network blip, a 5xx, or a CORS hiccup must not sign the user out — the 401
 * interceptor will catch a genuinely invalid token on the next request.
 */
async function refreshCurrentUser(deps: SessionRestoreDeps): Promise<void> {
  try {
    const user = await deps.getUser()
    if (user) deps.store.setUser(user)
  } catch (err) {
    const appErr = normalizeError(err)
    if (appErr.status === 401 || appErr.status === 403) {
      restoreLogger.warn('Session no longer valid — clearing auth', { status: appErr.status })
      deps.store.clearAuth()
    } else {
      restoreLogger.warn('Session restoration failed (kept current state)', {
        code: appErr.code,
        status: appErr.status,
      })
    }
  }
}
