// Everything here comes from core/lib, and nothing from './base' or './types'.
// This file is new in 1.1.0, so an upgrade always installs it, and it may sit
// beside a base.ts and a types.ts the project kept from 1.0: that base.ts has
// fixed paths and no endpoint table, and that types.ts declares none of what
// the auth seam added. `getAuthConfig().endpoints` is what the current base.ts
// is a view of, so these are the same calls the other adapters make.
import { apiBaseUrl } from '~/lib/api/base-url'
import { invalidateCsrfToken, primeCsrfToken } from '~/lib/api/csrf'
import { currentApiIntegration } from '~/lib/api/integration'
import type { AuthAdapter, ResumedSession } from '~/lib/auth/adapter'
import { getAuthConfig } from '~/lib/auth/config'
import { authLogger } from '~/lib/auth/endpoints'
import { normalizeError } from '~/lib/errors'
import type { AuthResponse } from '~/types'

/**
 * Fetch a CSRF token for the session about to start, when the strategy in
 * force can (`presets.laravel` asks `GET /sanctum/csrf-cookie`).
 *
 * This is the API client's own prime step, with the state it keeps between
 * requests, not a second implementation: a prime already on its way is joined,
 * and one that just left nothing to read is not repeated. The client would run
 * it anyway for a write that finds no token. It is asked for here because a
 * token may well be there, left by an earlier visit, and a sign-in should not
 * be sent with one that belongs to a session the visitor never chose: the
 * backend then binds the token it issues to the session the login is about to
 * be checked against. Never throws; a sign-in sent without a token is refused
 * by the backend, and that refusal is the error worth showing.
 */
async function primeCsrf(): Promise<void> {
  const { csrf, csrfPrime } = currentApiIntegration()
  await primeCsrfToken(csrf, apiBaseUrl, csrfPrime)
}

/**
 * What a call that starts a session hands back under this adapter: the user,
 * or the MFA challenge that comes before one. Never a token. The credential is
 * the cookie, and a backend that also put a token in the body (dj-rest-auth
 * does, unless told otherwise) has not given this app something to hold: it
 * would sit in memory unused, since nothing is sent as `Authorization` under
 * the cookie transport.
 */
function withoutTokens({ user, mfaRequired, mfaToken }: AuthResponse): AuthResponse {
  return {
    ...(user ? { user } : {}),
    ...(mfaRequired ? { mfaRequired, mfaToken } : {}),
  } as AuthResponse
}

/**
 * Server-session adapter: the backend keeps the session and names it in an
 * HttpOnly cookie, and state-changing requests carry a CSRF token. Laravel
 * Sanctum's SPA authentication, Django's `SessionAuthentication`, Rails,
 * Spring Security with `CookieCsrfTokenRepository` and ASP.NET cookie
 * authentication all work this way.
 *
 * There is no token in JavaScript at any point, and no refresh: the backend
 * renews the session itself, and when it ends, the next request is answered as
 * unauthenticated and the visitor is sent to sign in again (see
 * `bootstrap/auth-wiring.ts`).
 *
 * Backend contract, with nothing configured (the paths `oauth` and `jwt` use):
 *   POST /auth/login     → 204, or a body that may carry the user; sets the cookie
 *   POST /auth/register  → the same
 *   POST /auth/logout    → 204, ends the session
 *   GET  /auth/me        → User, or 401 when there is no session
 *
 * A real backend is two lines of configuration rather than an edit here.
 * Laravel with Sanctum:
 *
 *   auth.config.ts     endpoints: endpointPresets.sanctum
 *   api.overrides.ts   backend: presets.laravel
 *
 * The first says where the session routes are, the second how this backend
 * hands over its CSRF token and what its "stale token" and its errors look
 * like. An endpoint switched off in `auth.config.ts` takes its capability, and
 * the method behind it, with it.
 */
export function createSessionAdapter(): AuthAdapter {
  const { endpoints, capabilities: disclaimed } = getAuthConfig()
  const has = (...names: (keyof typeof endpoints.spec)[]) =>
    names.every((name) => endpoints.spec[name] !== null)

  const canRegister = has('register') && disclaimed.register !== false
  const canMagicLink = has('magicLink', 'magicLinkVerify') && disclaimed.magicLink !== false
  const canMfa = has('mfaSetup', 'mfaVerify', 'mfaDisable') && disclaimed.mfa !== false

  /**
   * Run a call that starts a session, then forget the CSRF token that was read
   * before it. Frameworks issue a new token with the new session (Laravel and
   * Django both do, against session fixation), and the old one must not be the
   * one the next write sends. Forgotten on a failure too: a refused sign-in may
   * have been refused over the token.
   */
  async function starting(call: () => Promise<AuthResponse>, prime: boolean) {
    if (prime) await primeCsrf()
    try {
      return withoutTokens(await call())
    } finally {
      invalidateCsrfToken()
    }
  }

  return {
    name: 'session',
    transport: 'cookie',
    capabilities: {
      register: canRegister,
      // A redirect flow, which is the `oauth` adapter's.
      social: false,
      magicLink: canMagicLink,
      mfa: canMfa,
      // The backend renews the session. There is nothing to rotate here.
      refresh: false,
      codeExchange: false,
    },

    login: (credentials) => starting(() => endpoints.cookieSession.login(credentials), true),

    ...(canRegister
      ? { register: (data) => starting(() => endpoints.cookieSession.register(data), true) }
      : {}),

    /**
     * End the session on the backend, then drop the cached CSRF token: it
     * belonged to the session that just ended. Done whether or not the request
     * succeeded (`endpoints.logout` logs a failure and resolves), because the
     * caller clears the app's own state either way.
     */
    async logout() {
      try {
        await endpoints.logout()
      } finally {
        invalidateCsrfToken()
      }
    },

    getUser: endpoints.getUser,

    /**
     * Ask the backend whether the cookie the browser holds is a session.
     *
     * Unconditional: there is nothing in JavaScript to check first. An answer
     * the client reads as unauthenticated (a 401, or whatever the classifiers
     * in `api.overrides.ts` say means it: DRF's 403 for an anonymous request, a
     * redirect to a login page) is the ordinary "nobody is signed in", and the
     * request is marked so that it triggers neither a refresh nor the
     * session-expired redirect.
     *
     * Anything else (offline, a 5xx, a timeout) says nothing about the
     * session, which may be perfectly valid. It resolves to null all the same,
     * as the other adapters' resume does, because a boot must not fail on it:
     * the visitor is treated as signed out for this page load and sees the
     * login page instead of an error screen. Nothing is ended by that. No
     * logout is sent and there is nothing in JavaScript to clear, so the cookie
     * is untouched and the next load, once the backend answers, resumes the
     * session.
     */
    async resumeSession(): Promise<ResumedSession | null> {
      try {
        const user = await endpoints.getUser()
        if (!user) return null
        authLogger.info('Session resumed from the session cookie.')
        return { user }
      } catch (err) {
        const appErr = normalizeError(err)
        if (appErr.status === 401 || appErr.status === 403) {
          authLogger.info('No session to resume.')
        } else {
          authLogger.warn(
            'Could not ask the backend whether there is a session. Treating this page load ' +
              'as signed out; the session cookie is untouched.',
            { code: appErr.code, status: appErr.status },
          )
        }
        return null
      }
    },

    // Both present, and both answering "no": with them absent the API client
    // would fall back to its own refresh request, with a body token, whenever
    // a response had handed the store one.
    refreshSession: () => Promise.resolve(null),
    canRefreshSession: () => false,

    ...(canMagicLink
      ? {
          sendMagicLink: endpoints.sendMagicLink,
          verifyMagicLink: (token) =>
            starting(() => endpoints.cookieSession.verifyMagicLink(token), false),
        }
      : {}),

    ...(canMfa
      ? {
          setupMfa: endpoints.setupMfa,
          verifyMfa: (request) => starting(() => endpoints.cookieSession.verifyMfa(request), false),
          disableMfa: endpoints.disableMfa,
        }
      : {}),
  }
}
