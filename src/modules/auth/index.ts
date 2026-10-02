import type { ModuleDefinition } from '../types'
import accountI18nAr from './i18n/ar.json'
import accountI18nEn from './i18n/en.json'
import accountI18nFr from './i18n/fr.json'

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
    origin: 'template',
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
  //
  // The account page is the exception: it belongs under `/dashboard`, not
  // `/auth`, so it lives in `views/` (outside the file-routed folder) and is
  // registered explicitly. Putting it in `pages/` would mount it at
  // `/auth/account`, behind the auth layout, with no sidebar.
  routes: [
    {
      path: '/dashboard/account',
      name: '/dashboard/account',
      component: () => import('./views/account.vue'),
      meta: {
        layout: 'dashboard',
        requiresAuth: true,
        module: 'auth',
        title: 'account_nav',
      },
    },
  ],

  navItems: [
    {
      label: 'account_nav',
      icon: 'shield-user',
      to: '/dashboard/account',
      group: 'account',
      order: 10,
    },
  ],

  i18n: {
    en: accountI18nEn,
    fr: accountI18nFr,
    ar: accountI18nAr,
  },

  // Two guards, both required:
  //   1. The dynamic import() keeps `msw` out of this barrel's static module
  //      graph, so importing the auth module does not pull in msw-vendor.
  //   2. The `__VUESTRATA_DEMO__` ternary lets rolldown drop the import()
  //      entirely from production builds. Without it the property is always
  //      constructed, the bundler must assume it may be called, and the
  //      msw-vendor chunk is emitted and referenced even though nothing in
  //      production ever calls it.
  // This is the pattern every module with mock handlers must follow.
  ...(__VUESTRATA_DEMO__
    ? {
        mockHandlers: async () => (await import('./mocks/auth.handlers')).authMockHandlers,
      }
    : {}),
}

export default authModule

// ─── Public API barrel ──────────────────────────────────
// Cross-module consumers MUST import from here.
export { useAuth, exchangeOAuthCode, getAuthAdapter } from './composables/useAuth'
export {
  createAuthAdapter,
  isJwtExpired,
  OAuthRedirectError,
  requireCapability,
  resolveAuthAdapterName,
  SUPPORTED_AUTH_ADAPTERS,
  UnsupportedAuthCapabilityError,
  type AuthAdapter,
  type AuthCapabilities,
  type AuthTransport,
  type SupportedAuthAdapter,
} from './adapters'
export { generateCodeVerifier, generateCodeChallenge, generateState } from './lib/pkce'
