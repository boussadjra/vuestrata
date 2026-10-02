/**
 * The auth adapter contract.
 *
 * These are types only, and they live in `core/lib` rather than beside the
 * adapters in `src/modules/auth/adapters/` for one reason: a project's
 * `app/config/auth.config.ts` is typed against them, and that file may import
 * nothing a project owns. The auth module's barrel is the project's; this
 * folder is Vuestrata's, so an upgrade can add a member here and every project
 * sees it. `src/modules/auth/adapters/types.ts` re-exports all of them, so
 * code that imports them from the auth module is unaffected.
 */
import type {
  AuthCredentials,
  AuthProvider,
  AuthResponse,
  MagicLinkRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
  User,
} from '~/types'

import type { AuthAdapterName } from '../config/env.schema'

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

/**
 * A social sign-in provider: one of the three the template ships buttons for,
 * or any id a project lists under `providers` in `auth.config.ts`. The
 * `string & {}` arm accepts those without costing the built-in names their
 * autocomplete.
 */
export type AuthProviderId = Exclude<AuthProvider, 'credentials'> | (string & {})

/**
 * What an adapter reports through `subscribe`: a change to the session that
 * the app did not ask for, because an SDK made it.
 */
export interface AuthStateChange {
  /** The session now in force, or null when there is none. */
  session: ResumedSession | null
  /**
   * Why a session ended. `'expired'` sends a visitor on a protected page to
   * the login page with the notice that says so; anything else is a sign-out,
   * and they are sent there without it.
   */
  reason?: 'logout' | 'expired'
}

/**
 * The single authentication contract, implemented once per strategy in
 * `src/modules/auth/adapters/{mock,jwt,oauth}.ts`, and by any adapter a
 * project registers.
 *
 * Only `login`, `logout` and `getUser` are required — every adapter must be
 * able to start a session, end one, and identify the current user. Everything
 * else is optional and gated by `capabilities`.
 *
 * Backend endpoints each adapter expects are documented in
 * `docs/6.configuration/2.auth-rbac.md`.
 */
export interface AuthAdapter {
  /** A built-in name, or the name a project registered its own adapter under. */
  readonly name: AuthAdapterName | (string & {})
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
  socialLogin?: (provider: AuthProviderId) => Promise<void>
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

  /**
   * Recover an existing session at boot, after a reload dropped the in-memory
   * token. Resolves to null when there is nothing to resume — that is the
   * normal answer for a signed-out visitor, not a failure.
   *
   * How it does that is the adapter's business: a cookie-transport adapter
   * asks `/auth/me` and lets the session cookie speak for itself, while a
   * bearer adapter presents a refresh credential whose location depends on
   * `VUESTRATA_SESSION_PERSISTENCE`.
   *
   * Unlike `exchangeCode` this gets no `capabilities` flag: nothing in the UI
   * branches on it, because there is no button to hide. An adapter that cannot
   * resume simply omits it, and the bootstrap treats that as "no session".
   */
  resumeSession?: () => Promise<ResumedSession | null>

  /**
   * Mint a new access token for the session in progress, presenting whichever
   * refresh credential this adapter's deployment uses: an HttpOnly cookie
   * (no body, cookies attached) or a refresh token held in memory or Web
   * Storage. Resolves to null when there is no credential to present; rejects
   * when the backend refuses or is unreachable.
   *
   * The interceptor (on a 401) and the store's proactive timer both call it
   * through the provider `bootstrap/auth-wiring.ts` installs. It is optional
   * and feature-detected there, so an adapter written before it existed keeps
   * the body-token refresh it always had.
   */
  refreshSession?: () => Promise<RefreshedSession | null>
  /** Whether `refreshSession` has a credential to present right now. */
  canRefreshSession?: () => boolean

  /**
   * Be told when the session changes without the app having asked: an SDK
   * that finished a redirect sign-in, rotated its token in the background, or
   * saw a sign-out in another tab. The bootstrap subscribes once, for the life
   * of the app, and writes each change to the auth store. Returns the function
   * that stops it.
   *
   * Optional and feature-detected, like `refreshSession`. The built-in
   * adapters have nothing to announce: every change to their session is the
   * answer to a request the app made.
   */
  subscribe?: (listener: (change: AuthStateChange) => void) => () => void

  /**
   * `'external'` when the adapter (in practice, the SDK behind it) keeps the
   * session itself. The app then holds the access token in memory only and is
   * never handed a refresh token, so there is nothing for it to write to Web
   * Storage, whatever `VUESTRATA_SESSION_PERSISTENCE` says. Leave it out for an
   * adapter whose refresh token the app is meant to keep.
   */
  persistence?: 'external'
}

/**
 * What an adapter is built with. Both are callbacks rather than values because
 * an adapter is constructed once and the tokens change on every refresh.
 */
export interface AuthAdapterOptions {
  /** The access token the store holds, for an adapter that checks its expiry. */
  getToken?: () => string | null
  /** The refresh token the store holds in memory, if any. */
  getRefreshToken?: () => string | null
}

/**
 * Builds an adapter. It is called more than once (the boot wiring, the session
 * restore and `useAuth()` each ask for one), so an SDK client belongs outside
 * it, created once by the module that exports the factory.
 */
export type AuthAdapterFactory = (options: AuthAdapterOptions) => AuthAdapter

/**
 * The answer of `POST /auth/refresh`.
 *
 * Deliberately NOT `AuthResponse`: the documented contract carries no `user`
 * (the app asks `/auth/me` for that), and under `refresh-cookie` no
 * `refreshToken` either — the rotated credential travels as a cookie. `user`
 * stays optional so a backend that does return one is used as it is.
 */
export interface RefreshedSession {
  token: string
  refreshToken?: string
  expiresIn?: number
  user?: User
}

/**
 * What a successful `resumeSession()` recovered.
 *
 * Deliberately NOT `AuthResponse`: that type requires `token`, and a
 * cookie-transport adapter never has one — the credential is an HttpOnly
 * cookie the browser owns and JavaScript cannot read. Forcing the cookie case
 * into `AuthResponse` would mean inventing a fake token, which is exactly the
 * kind of lie that makes `isAuthenticated` wrong.
 */
export interface ResumedSession {
  user: User
  /** Absent under cookie transport. */
  token?: string
  refreshToken?: string
  expiresIn?: number
}
