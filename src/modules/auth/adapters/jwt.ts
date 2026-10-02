import { jwtDecode } from 'jwt-decode'

import {
  readPersistedRefreshToken,
  usesRefreshCookie,
  usesWebStorage,
} from '~/lib/auth/session-persistence'
import { normalizeError } from '~/lib/errors'

import { authEndpoints, authLogger } from './base'
import type { AuthAdapter, RefreshedSession, ResumedSession } from './types'

/**
 * Clock-skew margin. A token that expires in under 30 seconds is treated as
 * already expired so a request cannot be sent with a token that dies in flight.
 */
const EXPIRY_MARGIN_SECONDS = 30

/**
 * Report whether a JWT is past (or about to pass) its `exp` claim.
 *
 * A token with no `exp` is treated as expired: an access token that never
 * expires is either a misconfiguration or not an access token, and failing
 * closed is the safe reading of both.
 */
export function isJwtExpired(token: string): boolean {
  try {
    const payload = jwtDecode<{ exp?: number }>(token)
    if (!payload.exp) {
      authLogger.warn('JWT missing exp claim; treating as expired')
      return true
    }
    return Date.now() >= (payload.exp - EXPIRY_MARGIN_SECONDS) * 1000
  } catch {
    return true
  }
}

/**
 * Bearer-token adapter: the app holds an access token and a refresh token, and
 * sets `Authorization` on every request.
 *
 * This used to be `return createBaseAdapter()` — a no-op wrapper that looked
 * like an implementation. `isJwtExpired` existed but was never called from any
 * code path, so the documented "checks expiry per call" behaviour did not
 * happen. `getUser` now actually uses it.
 *
 * Backend contract:
 *   POST /auth/login            → { user, token, refreshToken?, expiresIn }
 *   POST /auth/register         → same
 *   POST /auth/logout           → 204
 *   GET  /auth/me               → User            (Authorization: Bearer …)
 *   POST /auth/refresh          → { token, refreshToken?, expiresIn }   (no `user`)
 *   POST /auth/magic-link       → { message }
 *   POST /auth/magic-link/verify→ { user, token, … }
 *   POST /auth/mfa/{setup,verify,disable}
 */
export function createJwtAdapter(
  getToken: () => string | null = () => null,
  getRefreshToken: () => string | null = () => null,
): AuthAdapter {
  /**
   * The refresh token this deployment can present as a body, or null. Memory
   * first (it is the freshest, and the only source under `none`), then the
   * persisted copy. Under `refresh-cookie` there is none by design.
   */
  function heldRefreshToken(): string | null {
    const inMemory = getRefreshToken()
    if (inMemory) return inMemory
    return usesWebStorage() ? readPersistedRefreshToken() : null
  }

  /**
   * One refresh request, shaped by `VUESTRATA_SESSION_PERSISTENCE`. Rejects
   * on an HTTP failure; resolves to null only when there is nothing to present.
   */
  async function requestRefresh(): Promise<RefreshedSession | null> {
    if (usesRefreshCookie()) {
      // The cookie is the credential, and a backend built for this mode never
      // puts a refresh token in a body. One that did is a body-token backend
      // running under the default setting: its refresh worked mid-session
      // before the cookie path existed, so it gets its token back rather than
      // an empty request it would refuse. Cookies are attached either way, and
      // nothing is stored, so a reload still depends on the cookie alone.
      const inMemory = getRefreshToken()
      return inMemory
        ? authEndpoints.refreshWithToken(inMemory)
        : authEndpoints.resumeWithRefreshCookie()
    }

    const held = heldRefreshToken()
    return held ? authEndpoints.refreshWithToken(held) : null
  }

  return {
    name: 'jwt',
    transport: 'bearer',
    capabilities: {
      register: true,
      // Social sign-in is a redirect flow; use the `oauth` adapter for it.
      social: false,
      magicLink: true,
      mfa: true,
      refresh: true,
      codeExchange: false,
    },

    login: authEndpoints.login,
    register: authEndpoints.register,
    logout: authEndpoints.logout,
    refreshToken: authEndpoints.refreshToken,
    sendMagicLink: authEndpoints.sendMagicLink,
    verifyMagicLink: authEndpoints.verifyMagicLink,
    setupMfa: authEndpoints.setupMfa,
    verifyMfa: authEndpoints.verifyMfa,
    disableMfa: authEndpoints.disableMfa,

    /**
     * Recover a session after a reload dropped the in-memory access token.
     *
     * Which credential is presented depends on `VUESTRATA_SESSION_PERSISTENCE`:
     * an HttpOnly refresh cookie the backend set, or a refresh token this app
     * wrote to Web Storage. Under `none` there is nothing to present and the
     * session legitimately ends at the reload.
     *
     * A 401/403 means the credential is spent or was revoked — the ordinary
     * signed-out answer. Anything else (offline, 5xx, CORS) is reported as null
     * too, because a boot-time resume must never be the thing that white-screens
     * the app; the user simply lands on the login page.
     */
    async resumeSession(): Promise<ResumedSession | null> {
      let strategy: string
      if (usesRefreshCookie()) {
        strategy = 'refresh cookie'
      } else if (usesWebStorage() && readPersistedRefreshToken()) {
        strategy = 'persisted refresh token'
      } else {
        return null
      }

      const refreshed = await callResume(() => requestRefresh(), strategy)
      if (!refreshed) return null
      return withUser(refreshed)
    },

    refreshSession: requestRefresh,

    canRefreshSession: () => usesRefreshCookie() || heldRefreshToken() !== null,

    async getUser() {
      // Skip a request that is guaranteed to 401. Returning null lets the
      // caller treat it as "no session" and trigger a refresh, rather than
      // burning a round trip and tripping the 401 interceptor.
      const token = getToken()
      if (token && isJwtExpired(token)) {
        authLogger.info('Access token expired — skipping /auth/me')
        return null
      }
      return authEndpoints.getUser()
    },
  }
}

/**
 * Give a refreshed session the user it needs.
 *
 * `/auth/refresh` is documented to return tokens and no `user`, so most
 * backends leave the app to ask `/auth/me`. The fresh token is passed
 * explicitly — the store has none yet, which is the whole reason a resume is
 * happening. A backend that does return a user is taken at its word. When the
 * user cannot be fetched there is no session to resume: the refresh already
 * spent its credential, and a session without a user is worse than none.
 */
async function withUser(refreshed: RefreshedSession): Promise<ResumedSession | null> {
  const { user, ...tokens } = refreshed
  if (user) return { user, ...tokens }

  try {
    return { user: await authEndpoints.getUserAs(refreshed.token), ...tokens }
  } catch (err) {
    const appErr = normalizeError(err)
    authLogger.warn('Refreshed the session but could not load the user from /auth/me.', {
      code: appErr.code,
      status: appErr.status,
    })
    return null
  }
}

/**
 * Run one resume strategy, turning every failure into `null`.
 *
 * Split out so the two strategies cannot drift in how they classify errors —
 * the whole point is that NOTHING thrown here reaches the bootstrap.
 */
async function callResume(
  call: () => Promise<RefreshedSession | null>,
  strategy: string,
): Promise<RefreshedSession | null> {
  try {
    const result = await call()
    if (!result?.token) {
      authLogger.warn(`The ${strategy} refresh answered without an access token.`)
      return null
    }
    authLogger.info(`Session resumed from ${strategy}.`)
    return result
  } catch (err) {
    const appErr = normalizeError(err)
    if (appErr.status === 401 || appErr.status === 403) {
      authLogger.info(`No session to resume (${strategy} rejected).`)
    } else {
      authLogger.warn(`Could not resume the session from the ${strategy}.`, {
        code: appErr.code,
        status: appErr.status,
      })
    }
    return null
  }
}
