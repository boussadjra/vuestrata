import { runtimeEnv } from '~/lib/config'
import type { AuthProvider, AuthResponse } from '~/types'

import { generateCodeChallenge, generateCodeVerifier, generateState } from '../lib/pkce'
import { assertOAuthProvider, authEndpoints } from './base'
import { clearPkceState, OAUTH_STATE_TTL_MS, persistPkceState, readPkceState } from './pkce-state'
import { OAuthRedirectError, type AuthAdapter } from './types'

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

  const url = new URL(`${base}${path}`)
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
 * Backend contract:
 *   GET  {apiUrl}/auth/authorize        → 302 to the provider (PKCE params forwarded)
 *   GET  {apiUrl}/auth/:provider        → 302 to a specific provider
 *   POST {apiUrl}/auth/token            → { user, token, refreshToken, expiresIn }
 *                                         body: grant_type, code, code_verifier, redirect_uri
 *   GET  {apiUrl}/auth/me               → User (session cookie)
 *   POST {apiUrl}/auth/logout           → 204, clears the session cookie
 */
export function createOAuthAdapter(): AuthAdapter {
  return {
    name: 'oauth',
    transport: 'cookie',
    capabilities: {
      // Registration happens at the identity provider, not in this app.
      register: false,
      social: true,
      magicLink: false,
      mfa: false,
      // The session cookie is renewed by the backend; there is no refresh
      // token in the client to rotate.
      refresh: false,
      codeExchange: true,
    },

    logout: authEndpoints.logout,
    getUser: authEndpoints.getUser,

    async login() {
      return beginAuthorizationCodeFlow('/auth/authorize')
    },

    async socialLogin(provider: AuthProvider) {
      assertOAuthProvider(provider)
      await beginAuthorizationCodeFlow(`/auth/${provider}`)
    },

    async exchangeCode(code: string, state: string): Promise<AuthResponse> {
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
    },
  }
}
