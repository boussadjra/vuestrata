import type {
  AuthCredentials,
  AuthProvider,
  AuthResponse,
  MagicLinkRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
  User,
} from '~/types'

/**
 * How the adapter proves identity to the backend.
 *
 * This used to be ambiguous: the API client sent `credentials: 'include'` AND
 * an `Authorization: Bearer` header on every request, so a deployment was
 * simultaneously assuming cookie sessions and bearer tokens. That is not a
 * harmless belt-and-braces — CSRF protection is only required for the cookie
 * model, and sending ambient cookies to a bearer API is an unnecessary
 * cross-origin exposure.
 *
 *   bearer — the app holds the token and sets `Authorization` itself.
 *            Cookies are NOT sent. No CSRF header is needed: there is no
 *            ambient credential for a third-party site to ride on.
 *
 *   cookie — the backend sets an HttpOnly session cookie. The app never sees
 *            a token, so no `Authorization` header is sent. Requests DO send
 *            cookies, which means state-changing requests need a CSRF token.
 */
export type AuthTransport = 'bearer' | 'cookie'

/**
 * What the adapter can actually do.
 *
 * Replaces the previous design where the interface required all eleven
 * methods and adapters that did not support one either threw or silently
 * no-oped. With this, the UI can hide a magic-link button for an adapter that
 * has no magic-link endpoint, instead of the user discovering it at click time.
 */
export interface AuthCapabilities {
  /** Self-service registration through the app rather than the provider. */
  readonly register: boolean
  /** Social/OAuth provider sign-in. */
  readonly social: boolean
  /** Passwordless email links. */
  readonly magicLink: boolean
  /** TOTP enrolment and verification. */
  readonly mfa: boolean
  /** Refresh-token rotation. Cookie sessions usually renew server-side. */
  readonly refresh: boolean
  /** OAuth authorization-code exchange on the callback route. */
  readonly codeExchange: boolean
}

export const SUPPORTED_AUTH_ADAPTERS = ['mock', 'jwt', 'oauth'] as const
export type SupportedAuthAdapter = (typeof SUPPORTED_AUTH_ADAPTERS)[number]

/**
 * The single authentication contract, implemented once per strategy in
 * `adapters/{mock,jwt,oauth}.ts`.
 *
 * Only `login`, `logout` and `getUser` are required — every adapter must be
 * able to start a session, end one, and identify the current user. Everything
 * else is optional and gated by `capabilities`.
 *
 * Backend endpoints each adapter expects are documented in
 * `docs/6.configuration/2.auth-rbac.md`.
 */
export interface AuthAdapter {
  readonly name: SupportedAuthAdapter
  readonly transport: AuthTransport
  readonly capabilities: AuthCapabilities

  // Declared as function-typed PROPERTIES rather than method signatures.
  // Callers pass optional members around by reference (see `requireCapability`),
  // and a method signature would make every such reference an unbound-method
  // hazard. Adapters assign plain functions, so properties describe reality.
  login: (credentials: AuthCredentials) => Promise<AuthResponse>
  logout: () => Promise<void>
  getUser: () => Promise<User | null>

  register?: (credentials: AuthCredentials & { name: string }) => Promise<AuthResponse>
  refreshToken?: (token: string) => Promise<AuthResponse>
  socialLogin?: (provider: AuthProvider) => Promise<void>
  sendMagicLink?: (request: MagicLinkRequest) => Promise<{ message: string }>
  verifyMagicLink?: (token: string) => Promise<AuthResponse>
  setupMfa?: () => Promise<MfaSetupResponse>
  verifyMfa?: (request: MfaVerifyRequest) => Promise<AuthResponse>
  disableMfa?: () => Promise<void>
  /**
   * Exchange an OAuth authorization code for tokens. Previously a free
   * function that the callback page imported directly, which meant the
   * interface did not describe a step the flow depends on.
   */
  exchangeCode?: (code: string, state: string) => Promise<AuthResponse>
}

/**
 * Thrown by OAuth `login()`/`register()` to signal that the page is about to
 * be replaced by a provider redirect. Callers awaiting the promise detect it
 * with `instanceof` and skip their error UI.
 */
export class OAuthRedirectError extends Error {
  constructor(message = 'Redirecting to OAuth provider') {
    super(message)
    this.name = 'OAuthRedirectError'
  }
}

/** Raised when a caller invokes a method the configured adapter does not support. */
export class UnsupportedAuthCapabilityError extends Error {
  constructor(
    public readonly adapter: string,
    public readonly capability: keyof AuthCapabilities,
  ) {
    super(
      `The "${adapter}" auth adapter does not support "${capability}". ` +
        `Check adapter.capabilities.${capability} before calling this, or configure a different VUESTRATA_AUTH_ADAPTER.`,
    )
    this.name = 'UnsupportedAuthCapabilityError'
  }
}
