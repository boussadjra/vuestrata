import type { FetchContext } from 'ofetch'

import { apiFetch, type ApiFetchOptions } from '~/lib/api/client'
import { usesRefreshCookie } from '~/lib/auth/session-persistence'
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

import type { RefreshedSession } from './types'

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
 * What every `/auth/*` call shares.
 *
 * - `skipAuthRefresh`: these requests ARE the authentication flow. A 401 from
 *   one is its answer (a wrong password, a spent refresh token), and refreshing
 *   in response would re-enter the flow that is already failing.
 * - `credentials: 'include'` under `VUESTRATA_SESSION_PERSISTENCE=refresh-cookie`.
 *   The API client derives `credentials` from the auth TRANSPORT, and the jwt
 *   adapter is bearer, so it would send `omit` — and a browser neither stores
 *   nor sends a cookie for an `omit` request. The refresh cookie has to be
 *   stored by login/register/MFA/magic-link and read by refresh and logout, so
 *   it is one policy for the whole family rather than a per-call choice. The
 *   backend's CORS must therefore allow credentials on `/auth/*`. A
 *   cookie-TRANSPORT adapter needs nothing from here: the client already sends
 *   `include` on every request it makes.
 *
 * `options` win, so a call can still say otherwise.
 */
function authCall(options: ApiFetchOptions<'json'> = {}): ApiFetchOptions<'json'> {
  return {
    skipAuthRefresh: true,
    ...(usesRefreshCookie() ? { credentials: 'include' as const } : {}),
    ...options,
  }
}

/**
 * A refresh presents the refresh credential and nothing else.
 *
 * The API client attaches the session's access token to every request, and by
 * the time a 401 triggers a refresh that token is the expired one. A backend
 * that validates `Authorization` wherever it appears would reject the request
 * before it ever read the refresh credential. Hooks a caller passes run after
 * the client's own, so this one has the last word on the header.
 */
function withoutAccessToken({ options }: FetchContext): void {
  options.headers.delete('Authorization')
}

/** `POST /auth/refresh`, with whatever `options` say about the credential. */
function refreshCall(options: ApiFetchOptions<'json'>): ApiFetchOptions<'json'> {
  return authCall({ method: 'POST', onRequest: withoutAccessToken, ...options })
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
    apiFetch<AuthResponse>('/auth/login', authCall({ method: 'POST', body: credentials })),

  register: (data: AuthCredentials & { name: string }): Promise<AuthResponse> =>
    apiFetch<AuthResponse>('/auth/register', authCall({ method: 'POST', body: data })),

  logout: async (): Promise<void> => {
    // A backend logout failure must never block client-side cleanup — the user
    // has already decided to end the session — but it should stay visible in
    // logs so operators can spot a stuck endpoint.
    await apiFetch('/auth/logout', authCall({ method: 'POST' })).catch((err) => {
      authLogger.warn('Logout API call failed (clearing local session anyway)', { err })
    })
  },

  getUser: (): Promise<User | null> => apiFetch<User>('/auth/me', authCall()),

  /**
   * `GET /auth/me` as the holder of `token`, before the store has one.
   *
   * The token is passed explicitly because a session resume runs at boot, when
   * the store is empty and the interceptor would send no `Authorization`. The
   * interceptor leaves a header the caller set alone.
   */
  getUserAs: (token: string): Promise<User> =>
    apiFetch<User>('/auth/me', authCall({ headers: { Authorization: `Bearer ${token}` } })),

  /**
   * Trade a refresh token held by JavaScript for a new access token.
   *
   * Typed `AuthResponse` because the adapter contract's `refreshToken` always
   * was; the documented response carries no `user`. New code calls
   * `refreshWithToken`, which says so.
   */
  refreshToken: (token: string): Promise<AuthResponse> =>
    apiFetch<AuthResponse>('/auth/refresh', refreshCall({ body: { refreshToken: token } })),

  /** `refreshToken`, typed as what `/auth/refresh` actually returns. */
  refreshWithToken: (token: string): Promise<RefreshedSession> =>
    apiFetch<RefreshedSession>('/auth/refresh', refreshCall({ body: { refreshToken: token } })),

  /**
   * Mint a fresh access token from an HttpOnly refresh cookie.
   *
   * Same endpoint as `refreshToken`, but with no body and cookies attached:
   * the backend reads the credential it set itself. `credentials` is passed
   * explicitly, whatever the persistence mode, because this call only makes
   * sense with the cookie: the API client defaults it from the auth TRANSPORT,
   * and a bearer-transport deployment would otherwise send `omit`.
   *
   * A 401 here is the ordinary "no session to resume" answer, not an error
   * worth surfacing — see `resumeSession` in the JWT adapter.
   */
  resumeWithRefreshCookie: (): Promise<RefreshedSession> =>
    apiFetch<RefreshedSession>('/auth/refresh', refreshCall({ credentials: 'include' })),

  sendMagicLink: (request: MagicLinkRequest): Promise<{ message: string }> =>
    apiFetch<{ message: string }>('/auth/magic-link', authCall({ method: 'POST', body: request })),

  verifyMagicLink: (token: string): Promise<AuthResponse> =>
    apiFetch<AuthResponse>(
      '/auth/magic-link/verify',
      authCall({ method: 'POST', body: { token } }),
    ),

  setupMfa: (): Promise<MfaSetupResponse> =>
    apiFetch<MfaSetupResponse>('/auth/mfa/setup', authCall({ method: 'POST' })),

  verifyMfa: (request: MfaVerifyRequest): Promise<AuthResponse> =>
    apiFetch<AuthResponse>('/auth/mfa/verify', authCall({ method: 'POST', body: request })),

  disableMfa: async (): Promise<void> => {
    await apiFetch('/auth/mfa/disable', authCall({ method: 'POST' }))
  },

  exchangeCode: (body: {
    code: string
    code_verifier: string
    redirect_uri: string
  }): Promise<AuthResponse> =>
    apiFetch<AuthResponse>(
      '/auth/token',
      authCall({
        method: 'POST',
        body: { grant_type: 'authorization_code', ...body },
      }),
    ),
}

export { authLogger }
