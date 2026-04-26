import type { ModuleDefinition } from '../types'
import { authMockHandlers } from './mocks/auth.handlers'

/**
 * Auth Module
 *
 * Owns the user-facing authentication surface: login/register/callback pages,
 * the `useAuth` orchestrator, the OAuth PKCE helper, and the MSW mock handlers
 * that back the mock adapter.
 *
 * Identity *infrastructure* is intentionally NOT part of this module — those
 * pieces must run before the module system boots and live elsewhere:
 *   - Auth store          → src/modules/app/stores/auth.ts
 *   - API auth interceptor → src/modules/core/lib/api/auth-interceptor.ts
 *   - Router auth guard    → src/modules/app/plugins/router.ts
 *   - RBAC engine         → src/modules/core/lib/rbac/
 *
 * The module is marked `required: true` because the app cannot operate
 * without the auth pages and adapter wiring.
 *
 * Public API (importable via barrel `~/modules/auth`):
 *   - useAuth, exchangeOAuthCode, createAuthAdapter, resolveAuthAdapterName
 *   - OAuthRedirectError, AuthAdapter
 *   - PKCE helpers
 */
const authModule: ModuleDefinition = {
  config: {
    id: 'auth',
    name: 'Auth',
    description: 'Authentication pages, adapters, and OAuth/MFA flows',
    version: '1.0.0',
    category: 'core',
    order: 0,
    enabledByDefault: true,
    required: true,
  },

  // Auth pages (`/auth/login`, `/auth/register`, `/auth/callback`) are
  // discovered by Vue Router file-based routing from `src/modules/auth/pages/` with the
  // `auth/` path prefix configured in vite.config.ts. They are NOT listed
  // here to avoid duplicate route registration.

  mockHandlers: () => authMockHandlers,
}

export default authModule

// ─── Public API barrel ──────────────────────────────────
// Cross-module consumers MUST import from here.
export {
  useAuth,
  createAuthAdapter,
  resolveAuthAdapterName,
  exchangeOAuthCode,
  OAuthRedirectError,
  type AuthAdapter,
} from './composables/useAuth'
export { generateCodeVerifier, generateCodeChallenge, generateState } from './lib/pkce'
