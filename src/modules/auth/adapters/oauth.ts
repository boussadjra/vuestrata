// The adapter types come from core/lib, not './types': a project that kept its
// adapters has the 1.0 types.ts, which declares none of what the auth seam added.
import type { AuthAdapter, AuthProviderId, ResumedSession } from '~/lib/auth/adapter'
import { getAuthConfig } from '~/lib/auth/config'
import { runtimeEnv } from '~/lib/config'
import { normalizeError } from '~/lib/errors'
import type { AuthResponse } from '~/types'

import { generateCodeChallenge, generateCodeVerifier, generateState } from '../lib/pkce'
import { assertOAuthProvider, authEndpoints, authLogger } from './base'
import { clearPkceState, OAUTH_STATE_TTL_MS, persistPkceState, readPkceState } from './pkce-state'
import { OAuthRedirectError } from './types'

function callbackUrl(): string {
  return `${window.location.origin}/auth/callback`
}

/**
 * Build a provider authorize URL under the configured API base.
 *
 * The base comes from `runtimeEnv.apiUrl` rather than a hardcoded `/api`. The
 * previous implementation hardcoded the prefix, so any deployment serving its
 * API from a different origin or path silently redirected to a URL that did
 * not exist.
 */
function authorizeUrl(path: string, params: Record<string, string>): string {
  const base = runtimeEnv.apiUrl.startsWith('/')
    ? `${window.location.origin}${runtimeEnv.apiUrl.replace(/\/+$/, '')}`
    : runtimeEnv.apiUrl.replace(/\/+$/, '')

  // An endpoint configured as an absolute URL is the identity provider's own
  // address, and is used as it is.
  const url = new URL(/^https?:\/\//i.test(path) ? path : `${base}${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

async function beginAuthorizationCodeFlow(path: string): Promise<never> {
  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  // Persist BEFORE navigating — once the redirect starts, no further script
  // in this document is guaranteed to run.
  persistPkceState(state, codeVerifier)

  window.location.href = authorizeUrl(path, {
    response_type: 'code',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    redirect_uri: callbackUrl(),
  })

  // The page is being replaced. Throw a recognisable sentinel so an awaiting
  // caller can tell "redirect in progress" apart from a genuine failure.
  throw new OAuthRedirectError()
}

/**
 * OAuth 2.0 authorization-code adapter with PKCE.
 *
 * Transport is `cookie` by default: the recommended browser pattern is a
 * backend-for-frontend that completes the code exchange server-side and issues
 * an HttpOnly session cookie, so no token is ever exposed to JavaScript. That
 * choice is what turns on CSRF headers in the API client.
 *
 * Backend contract, as shipped:
 *   GET  {apiUrl}/auth/authorize        → 302 to the provider (PKCE params forwarded)
 *   GET  {apiUrl}/auth/:provider        → 302 to a specific provider
 *   POST {apiUrl}/auth/token            → { user, token, refreshToken, expiresIn }
 *                                         body: grant_type, code, code_verifier, redirect_uri
 *   GET  {apiUrl}/auth/me               → User (session cookie)
 *   POST {apiUrl}/auth/logout           → 204, clears the session cookie
 *
 * The paths, the response shapes and the provider list are configured in
 * `app/config/auth.config.ts`. An endpoint switched off there takes its
 * capability, and the method behind it, with it.
 */
export function createOAuthAdapter(): AuthAdapter {
  const { endpoints, capabilities: disclaimed, providers } = getAuthConfig()
  const authorizePath = endpoints.spec.authorize?.path
  // A provider button needs a provider to name and somewhere to send it.
  const providerPath =
    providers.length > 0 && disclaimed.social !== false
      ? endpoints.spec.providerAuthorize?.path
      : undefined
  const canExchange = endpoints.spec.token !== null && disclaimed.codeExchange !== false

  async function exchangeCode(code: string, state: string): Promise<AuthResponse> {
    const { state: savedState, verifier, issuedAt } = readPkceState()

    if (!savedState || savedState !== state) {
      // Deliberately NOT clearing state here: leaving the entries intact lets
      // a reload of the same callback URL succeed after a transient mismatch
      // (browser back-button replay). State is consumed only on success.
      throw new Error('OAuth state mismatch — possible CSRF attack. Please try logging in again.')
    }

    if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > OAUTH_STATE_TTL_MS) {
      // Expiry IS unrecoverable, so clear it and make the next attempt start clean.
      clearPkceState()
      throw new Error('OAuth state expired. Please try logging in again.')
    }

    if (!verifier) {
      throw new Error('Missing PKCE code verifier. Please try logging in again.')
    }

    const response = await authEndpoints.exchangeCode({
      code,
      code_verifier: verifier,
      redirect_uri: callbackUrl(),
    })

    // Only consume the one-shot state once the exchange has actually
    // succeeded — a transient backend failure must not strand the user with
    // no way to retry.
    clearPkceState()

    return response
  }

  return {
    name: 'oauth',
    transport: 'cookie',
    capabilities: {
      // Registration happens at the identity provider, not in this app.
      register: false,
      social: providerPath !== undefined,
      magicLink: false,
      mfa: false,
      // The session cookie is renewed by the backend; there is no refresh
      // token in the client to rotate.
      refresh: false,
      codeExchange: canExchange,
    },

    logout: authEndpoints.logout,
    getUser: authEndpoints.getUser,

    /**
     * Resume from the HttpOnly session cookie.
     *
     * This runs unconditionally — there is no stored token to check first, and
     * checking for one is precisely the bug this replaced: the bootstrap used
     * to gate session restoration on `authStore.token`, which under cookie
     * transport is ALWAYS null. A signed-in user with a perfectly valid session
     * cookie was therefore treated as signed out on every reload.
     *
     * No token comes back, and none is invented. `ResumedSession.token` stays
     * undefined and the auth store's `isAuthenticated` accounts for cookie
     * transport directly.
     */
    async resumeSession(): Promise<ResumedSession | null> {
      try {
        const user = await authEndpoints.getUser()
        if (!user) return null
        authLogger.info('Session resumed from the session cookie.')
        return { user }
      } catch (err) {
        const appErr = normalizeError(err)
        if (appErr.status === 401 || appErr.status === 403) {
          authLogger.info('No session cookie to resume.')
        } else {
          authLogger.warn('Could not resume the session from the session cookie.', {
            code: appErr.code,
            status: appErr.status,
          })
        }
        return null
      }
    },

    async login() {
      if (!authorizePath) {
        throw new Error(
          'The "oauth" adapter starts a sign-in at the `authorize` endpoint, which is switched ' +
            'off in auth.config.ts.',
        )
      }
      return beginAuthorizationCodeFlow(authorizePath)
    },

    ...(providerPath !== undefined
      ? {
          async socialLogin(provider: AuthProviderId) {
            assertOAuthProvider(provider)
            await beginAuthorizationCodeFlow(
              providerPath.replace(':provider', encodeURIComponent(provider)),
            )
          },
        }
      : {}),

    ...(canExchange ? { exchangeCode } : {}),
  }
}
