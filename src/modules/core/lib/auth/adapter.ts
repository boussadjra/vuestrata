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
 * an SDK made, whether or not the app asked for it.
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
  /**
   * Where this change falls in the order the SDK made them: a number that
   * never goes down from one change to the next. In practice a counter the
   * adapter keeps, incremented when the SDK reports a change and read BEFORE
   * any `await`; an SDK's own event time serves too, if it never goes back.
   * One counter covers every change the adapter reports, sign-outs included.
   *
   * Optional, and worth supplying. With it the bootstrap drops a change that
   * arrives after a later one, and can tell a new sign-in from a stale
   * announcement once this tab has signed out. Without it, it has to take
   * changes in the order they are delivered. See `AuthAdapter.subscribe`.
   */
  sequence?: number
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
   *
   * **What the adapter owes the listener**
   *
   * 1. Changes in the SDK's order. Call the listener for each change in the
   *    order the SDK made them. An adapter that does asynchronous work between
   *    the SDK's event and the call (fetching a profile, say) must drop its
   *    result when a later event has arrived meanwhile: note a counter before
   *    the `await`, compare it after, and pass it on as `sequence`.
   * 2. `logout()` ends the SDK's session. The app clears its own state when
   *    the user signs out; an SDK that was not told would keep rotating a token
   *    for somebody who has left.
   * 3. A user that fits `User`. It is validated either way; one that does not
   *    fit is logged and the change ignored.
   *
   * **What the bootstrap does with a change** (`bootstrap/auth-wiring.ts`)
   *
   * - *Out of order.* A change whose `sequence` is lower than one already
   *   received is dropped. A session established later is never replaced by
   *   one announced earlier, provided the adapter supplies `sequence`; one
   *   that does not is taken at its word on order.
   * - *Another user.* When the store holds a user and the session announced
   *   is somebody else's, the current session is ended first — one
   *   `auth.logout`, so the query cache is dropped and a refresh in flight
   *   discarded — and only then is the new user set.
   * - *After a sign-out in this tab.* Once the app has ended a session itself
   *   (`useAuth().logout()`, an expiry), a session the adapter announces is
   *   ignored: it cannot be told from a late announcement of the session that
   *   just ended, and honouring it would sign the user back in. That lasts
   *   until the app signs somebody in itself, or until the adapter reports the
   *   end of the session (`session: null`) with a `sequence`: whatever it
   *   announces after that is, by its own order, a new sign-in. Without
   *   `sequence` only the app's own sign-in ends it.
   * - *A session that ended elsewhere* (`session: null`) clears the store and
   *   sends a visitor on a protected page to the login page. That is the SDK's
   *   own report, so a session it announces afterwards is honoured.
   * - Under bearer transport a session with no `token` is ignored.
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
