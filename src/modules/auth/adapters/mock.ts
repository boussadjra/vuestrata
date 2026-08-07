import type { AuthProvider, AuthResponse } from '~/types'

import { assertOAuthProvider, authEndpoints } from './base'
import { clearPkceState, persistPkceState, readPkceState } from './pkce-state'
import type { AuthAdapter } from './types'

/** State value the mock uses in place of a real PKCE handshake. */
const MOCK_OAUTH_STATE = 'mock'
const MOCK_OAUTH_VERIFIER = 'mock-code-verifier'

/**
 * Demo adapter, backed by the MSW handlers in `auth/mocks/auth.handlers.ts`.
 *
 * Only reachable in a demo build: the env schema rejects
 * `VUESTRATA_AUTH_ADAPTER=mock` outside demo mode, because these endpoints
 * exist only inside the service worker.
 *
 * Transport is `bearer` — the mock mints an unsigned JWT so the demo exercises
 * the same header path a real bearer backend would.
 */
export function createMockAdapter(): AuthAdapter {
  return {
    name: 'mock',
    transport: 'bearer',
    capabilities: {
      register: true,
      social: true,
      magicLink: true,
      mfa: true,
      refresh: true,
      codeExchange: true,
    },

    login: authEndpoints.login,
    register: authEndpoints.register,
    getUser: authEndpoints.getUser,
    refreshToken: authEndpoints.refreshToken,
    sendMagicLink: authEndpoints.sendMagicLink,
    verifyMagicLink: authEndpoints.verifyMagicLink,
    setupMfa: authEndpoints.setupMfa,
    verifyMfa: authEndpoints.verifyMfa,
    disableMfa: authEndpoints.disableMfa,

    async logout() {
      await authEndpoints.logout()
      // Dynamic import behind the compile-time guard: this is the only edge
      // from the auth module into the demo IndexedDB layer, and keeping it
      // here is what lets rolldown drop demo-store/demo-storage/demo-persistence
      // from a production bundle entirely.
      if (__VUESTRATA_DEMO__) {
        const { clearDemoSession } = await import('~/state/demo')
        await clearDemoSession()
      }
    },

    async socialLogin(provider: AuthProvider) {
      assertOAuthProvider(provider)
      // No real provider to redirect to: jump straight to our own callback
      // with a recognisable code, so the demo still exercises the callback
      // route and the code-exchange path.
      persistPkceState(MOCK_OAUTH_STATE, MOCK_OAUTH_VERIFIER)

      const url = new URL('/auth/callback', window.location.origin)
      url.searchParams.set('code', `demo-oauth-code-${provider}`)
      url.searchParams.set('state', MOCK_OAUTH_STATE)
      window.location.href = url.toString()
    },

    async exchangeCode(code: string, state: string): Promise<AuthResponse> {
      const { state: savedState } = readPkceState()
      if (!savedState || savedState !== state) {
        throw new Error('OAuth state mismatch — possible CSRF attack. Please try logging in again.')
      }

      const response = await authEndpoints.exchangeCode({
        code,
        code_verifier: MOCK_OAUTH_VERIFIER,
        redirect_uri: `${window.location.origin}/auth/callback`,
      })

      clearPkceState()
      return response
    },
  }
}
