// From core/lib, not './types': a project that kept its adapters has the 1.0 one.
import type { AuthAdapter, AuthProviderId } from '~/lib/auth/adapter'
import { createAuthEndpoints } from '~/lib/auth/endpoints'
import { appUrl } from '~/lib/config'
import type { AuthResponse } from '~/types'

import { assertOAuthProvider } from './base'
import { clearPkceState, persistPkceState, readPkceState } from './pkce-state'

/** State value the mock uses in place of a real PKCE handshake. */
const MOCK_OAUTH_STATE = 'mock'
const MOCK_OAUTH_VERIFIER = 'mock-code-verifier'

/**
 * Demo adapter, backed by the MSW handlers in `auth/mocks/auth.handlers.ts`.
 *
 * Only reachable in a demo build: the env schema rejects
 * `VUESTRATA_AUTH_ADAPTER=mock` outside demo mode, because these endpoints
 * exist only inside the service worker, and the adapter registry leaves this
 * file out of a production bundle altogether.
 *
 * Transport is `bearer` — the mock mints an unsigned JWT so the demo exercises
 * the same header path a real bearer backend would.
 *
 * It always speaks the documented Vuestrata contract, whatever
 * `app/config/auth.config.ts` says about endpoints and response shapes: that
 * file describes the project's real backend, and the mock's backend is the
 * service worker, which serves the documented one. A project can therefore
 * configure its backend and still run the demo. The provider list is the one
 * thing it does take from the configuration, since the login page renders it.
 */
export function createMockAdapter(): AuthAdapter {
  const endpoints = createAuthEndpoints()

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

    login: endpoints.login,
    register: endpoints.register,
    getUser: endpoints.getUser,
    refreshToken: endpoints.refreshToken,
    sendMagicLink: endpoints.sendMagicLink,
    verifyMagicLink: endpoints.verifyMagicLink,
    setupMfa: endpoints.setupMfa,
    verifyMfa: endpoints.verifyMfa,
    disableMfa: endpoints.disableMfa,

    async logout() {
      await endpoints.logout()
      // Dynamic import behind the compile-time guard: this is the only edge
      // from the auth module into the demo IndexedDB layer, and keeping it
      // here is what lets rolldown drop demo-store/demo-storage/demo-persistence
      // from a production bundle entirely.
      if (__VUESTRATA_DEMO__) {
        const { clearDemoSession } = await import('~/state/demo')
        await clearDemoSession()
      }
    },

    async socialLogin(provider: AuthProviderId) {
      // Cast to what base.ts takes: a base.ts the project kept from 1.0 takes the
      // closed list, and checks the value all the same.
      assertOAuthProvider(provider as Parameters<typeof assertOAuthProvider>[0])
      // No real provider to redirect to: jump straight to our own callback
      // with a recognisable code, so the demo still exercises the callback
      // route and the code-exchange path.
      persistPkceState(MOCK_OAUTH_STATE, MOCK_OAUTH_VERIFIER)

      const url = new URL(appUrl('/auth/callback'))
      url.searchParams.set('code', `demo-oauth-code-${provider}`)
      url.searchParams.set('state', MOCK_OAUTH_STATE)
      window.location.href = url.toString()
    },

    async exchangeCode(code: string, state: string): Promise<AuthResponse> {
      const { state: savedState } = readPkceState()
      if (!savedState || savedState !== state) {
        throw new Error('OAuth state mismatch — possible CSRF attack. Please try logging in again.')
      }

      const response = await endpoints.exchangeCode({
        code,
        code_verifier: MOCK_OAUTH_VERIFIER,
        redirect_uri: appUrl('/auth/callback'),
      })

      clearPkceState()
      return response
    },
  }
}
