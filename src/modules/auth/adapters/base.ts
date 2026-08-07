import { apiFetch } from '~/lib/api/client'
import { createScopedLogger } from '~/lib/logger'
import type {
  AuthCredentials,
  AuthProvider,
  AuthResponse,
  MagicLinkRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
  User,
} from '~/types'

const authLogger = createScopedLogger('auth')

/**
 * Runtime allowlist of OAuth providers. The `AuthProvider` TS union does not
 * survive a `?provider=` query string or an untrusted caller, so the check has
 * to exist at runtime too.
 */
const SUPPORTED_OAUTH_PROVIDERS = new Set<AuthProvider>(['google', 'github', 'microsoft'])

export function assertOAuthProvider(provider: AuthProvider): void {
  if (!SUPPORTED_OAUTH_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported OAuth provider: "${provider}"`)
  }
}

/**
 * The wire calls every adapter shares.
 *
 * These are plain functions rather than an object spread into each adapter, so
 * each adapter states explicitly which endpoints it uses. The previous
 * `...base` spread is what let the JWT adapter be an empty wrapper that looked
 * like a real implementation.
 *
 * Every call goes through `apiFetch`, never bare `ofetch` — that is what
 * applies the configured transport, CSRF handling, retry policy, and error
 * normalization.
 */
// Arrow properties rather than method shorthand: adapters assign these
// directly (`login: authEndpoints.login`), and an unbound method reference
// would be a `this`-dependent footgun. Arrows have no `this` to lose.
export const authEndpoints = {
  login: (credentials: AuthCredentials): Promise<AuthResponse> =>
    apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: credentials }),

  register: (data: AuthCredentials & { name: string }): Promise<AuthResponse> =>
    apiFetch<AuthResponse>('/auth/register', { method: 'POST', body: data }),

  logout: async (): Promise<void> => {
    // A backend logout failure must never block client-side cleanup — the user
    // has already decided to end the session — but it should stay visible in
    // logs so operators can spot a stuck endpoint.
    await apiFetch('/auth/logout', { method: 'POST' }).catch((err) => {
      authLogger.warn('Logout API call failed (clearing local session anyway)', { err })
    })
  },

  getUser: (): Promise<User | null> => apiFetch<User>('/auth/me'),

  refreshToken: (token: string): Promise<AuthResponse> =>
    apiFetch<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: token },
    }),

  sendMagicLink: (request: MagicLinkRequest): Promise<{ message: string }> =>
    apiFetch<{ message: string }>('/auth/magic-link', { method: 'POST', body: request }),

  verifyMagicLink: (token: string): Promise<AuthResponse> =>
    apiFetch<AuthResponse>('/auth/magic-link/verify', {
      method: 'POST',
      body: { token },
    }),

  setupMfa: (): Promise<MfaSetupResponse> =>
    apiFetch<MfaSetupResponse>('/auth/mfa/setup', { method: 'POST' }),

  verifyMfa: (request: MfaVerifyRequest): Promise<AuthResponse> =>
    apiFetch<AuthResponse>('/auth/mfa/verify', { method: 'POST', body: request }),

  disableMfa: async (): Promise<void> => {
    await apiFetch('/auth/mfa/disable', { method: 'POST' })
  },

  exchangeCode: (body: {
    code: string
    code_verifier: string
    redirect_uri: string
  }): Promise<AuthResponse> =>
    apiFetch<AuthResponse>('/auth/token', {
      method: 'POST',
      body: { grant_type: 'authorization_code', ...body },
    }),
}

export { authLogger }
