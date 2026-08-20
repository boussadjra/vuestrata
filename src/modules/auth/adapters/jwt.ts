import { jwtDecode } from 'jwt-decode'

import {
  readPersistedRefreshToken,
  usesRefreshCookie,
  usesWebStorage,
} from '~/lib/auth/session-persistence'
import { normalizeError } from '~/lib/errors'
import type { User } from '~/types'

import { authEndpoints, authLogger } from './base'
import type { AuthAdapter, ResumedSession } from './types'

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
 *   POST /auth/login            → { user, token, refreshToken, expiresIn }
 *   POST /auth/register         → same
 *   POST /auth/logout           → 204
 *   GET  /auth/me               → User            (Authorization: Bearer …)
 *   POST /auth/refresh          → { token, refreshToken, expiresIn }
 *   POST /auth/magic-link       → { message }
 *   POST /auth/magic-link/verify→ { user, token, … }
 *   POST /auth/mfa/{setup,verify,disable}
 */
export function createJwtAdapter(getToken: () => string | null = () => null): AuthAdapter {
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
      if (usesRefreshCookie()) {
        return callResume(() => authEndpoints.resumeWithRefreshCookie(), 'refresh cookie')
      }

      if (usesWebStorage()) {
        const stored = readPersistedRefreshToken()
        if (!stored) return null
        return callResume(() => authEndpoints.refreshToken(stored), 'persisted refresh token')
      }

      return null
    },

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
 * Run one resume strategy, turning every failure into `null`.
 *
 * Split out so the two strategies cannot drift in how they classify errors —
 * the whole point is that NOTHING thrown here reaches the bootstrap.
 */
async function callResume(
  call: () => Promise<{ user: User; token: string; refreshToken: string; expiresIn: number }>,
  strategy: string,
): Promise<ResumedSession | null> {
  try {
    const result = await call()
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
