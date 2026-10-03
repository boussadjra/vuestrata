import type { FetchContext } from 'ofetch'

// From the interceptor module, not through `client`: a test that replaces the
// client with a stub of `apiFetch` alone must still be able to load this.
import { getAuthTransport } from '~/lib/api/auth-interceptor'
import { apiFetch, type ApiFetchOptions } from '~/lib/api/client'
import { AppError } from '~/lib/errors'
import { createScopedLogger } from '~/lib/logger'
import type {
  AuthCredentials,
  AuthResponse,
  MagicLinkRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
  User,
} from '~/types'

import type { RefreshedSession } from './adapter'
import { usesRefreshCookie } from './session-persistence'
import { authContractMismatch, parseUser, type UserInput } from './user'

export const authLogger = createScopedLogger('auth')

// ─── The endpoint table ───────────────────────────────────────────────────────

/** Every request the built-in adapters can make, by what it is for. */
export const AUTH_ENDPOINT_NAMES = [
  'login',
  'register',
  'logout',
  'me',
  'refresh',
  'magicLink',
  'magicLinkVerify',
  'mfaSetup',
  'mfaVerify',
  'mfaDisable',
  'authorize',
  'providerAuthorize',
  'token',
] as const
export type AuthEndpointName = (typeof AUTH_ENDPOINT_NAMES)[number]

export type AuthEndpointMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * Where one request goes. `path` is relative to `VUESTRATA_API_URL`, like every
 * path handed to the API client; an absolute `http(s)://` URL is used as it is.
 * `providerAuthorize` carries a `:provider` segment.
 */
export interface AuthEndpoint {
  readonly path: string
  readonly method?: AuthEndpointMethod
}

/**
 * What a project writes for one endpoint: a path, a path with a method, or
 * `null`/`false` for a backend that does not have it. Switching one off
 * switches off the capability it backs, and the UI already hides its controls
 * by capability.
 */
export type AuthEndpointSetting = string | AuthEndpoint | null | false

/** `endpoints` in `auth.config.ts`: the endpoints that differ from the preset. */
export type AuthEndpointOverrides = { readonly [K in AuthEndpointName]?: AuthEndpointSetting }

/** The table in force: every endpoint, each resolved to a request or switched off. */
export type AuthEndpointSpec = { readonly [K in AuthEndpointName]: AuthEndpoint | null }

/**
 * The method a path written as a bare string gets. `me` and the two authorize
 * endpoints have none: one is a GET, and the others are not requests at all
 * but addresses the browser is sent to.
 */
const DEFAULT_METHODS: Partial<Record<AuthEndpointName, AuthEndpointMethod>> = {
  login: 'POST',
  register: 'POST',
  logout: 'POST',
  refresh: 'POST',
  magicLink: 'POST',
  magicLinkVerify: 'POST',
  mfaSetup: 'POST',
  mfaVerify: 'POST',
  mfaDisable: 'POST',
  token: 'POST',
}

/**
 * Ready-made endpoint tables. `vuestrata` is the contract documented in
 * `docs/6.configuration/2.auth-rbac.md`, the one the demo's mock backend
 * serves, and what a project that configures nothing gets. Spread one to change
 * a path and keep the rest:
 *
 *   endpoints: { ...endpointPresets.vuestrata, me: '/users/me' }
 */
export const endpointPresets = {
  vuestrata: {
    login: { path: '/auth/login', method: 'POST' },
    register: { path: '/auth/register', method: 'POST' },
    logout: { path: '/auth/logout', method: 'POST' },
    me: { path: '/auth/me' },
    refresh: { path: '/auth/refresh', method: 'POST' },
    magicLink: { path: '/auth/magic-link', method: 'POST' },
    magicLinkVerify: { path: '/auth/magic-link/verify', method: 'POST' },
    mfaSetup: { path: '/auth/mfa/setup', method: 'POST' },
    mfaVerify: { path: '/auth/mfa/verify', method: 'POST' },
    mfaDisable: { path: '/auth/mfa/disable', method: 'POST' },
    authorize: { path: '/auth/authorize' },
    providerAuthorize: { path: '/auth/:provider' },
    token: { path: '/auth/token', method: 'POST' },
  },
} as const satisfies Record<string, AuthEndpointSpec>

const isUsablePath = (path: unknown): path is string =>
  typeof path === 'string' && (path.startsWith('/') || /^https?:\/\//i.test(path))

/**
 * The table a set of overrides produces, on top of the `vuestrata` preset.
 *
 * Throws on what cannot be meant: a name that is not an endpoint (a typo would
 * otherwise leave the default in place and say nothing), a path that is
 * neither rooted nor absolute, and `login` or `me` switched off — every adapter
 * has to be able to start a session and to say who it belongs to.
 */
export function resolveAuthEndpoints(overrides: AuthEndpointOverrides = {}): AuthEndpointSpec {
  const known = new Set<string>(AUTH_ENDPOINT_NAMES)
  const unknown = Object.keys(overrides).filter((name) => !known.has(name))
  if (unknown.length > 0) {
    throw new Error(
      `auth.config.ts: unknown endpoint(s) ${unknown.map((name) => `"${name}"`).join(', ')}. ` +
        `Known endpoints: ${AUTH_ENDPOINT_NAMES.join(', ')}.`,
    )
  }

  const spec = {} as Record<AuthEndpointName, AuthEndpoint | null>
  for (const name of AUTH_ENDPOINT_NAMES) {
    const setting = overrides[name]
    if (setting === undefined) {
      spec[name] = endpointPresets.vuestrata[name]
      continue
    }
    if (setting === null || setting === false) {
      if (name === 'login' || name === 'me') {
        throw new Error(
          `auth.config.ts: the "${name}" endpoint cannot be switched off. Every adapter has to ` +
            'start a session and identify its user.',
        )
      }
      spec[name] = null
      continue
    }

    const endpoint = typeof setting === 'string' ? { path: setting } : setting
    if (!isUsablePath(endpoint.path)) {
      throw new Error(
        `auth.config.ts: the "${name}" endpoint must be a path starting with "/" (relative to ` +
          `VUESTRATA_API_URL) or an absolute http(s) URL; received ${JSON.stringify(endpoint.path)}.`,
      )
    }
    const method = endpoint.method ?? DEFAULT_METHODS[name]
    spec[name] = method ? { path: endpoint.path, method } : { path: endpoint.path }
  }
  return spec
}

// ─── Response shapes ──────────────────────────────────────────────────────────

/**
 * What a response mapper hands back: the app's own names for what the backend
 * sent, whatever it called them.
 *
 * `user` is the backend's user record exactly as it came. It goes through
 * `mapUser` and the `User` schema afterwards, so a mapper never has to shape
 * it. When a login answers with tokens and no user, the app asks the `me`
 * endpoint with the token it was just given.
 */
export interface MappedAuthResponse {
  user?: unknown
  token?: string
  refreshToken?: string
  /** Lifetime of `token`, in seconds. */
  expiresIn?: number
  /** The login is not finished: the MFA challenge comes first. */
  mfaRequired?: boolean
  /** The temporary token that completes that challenge. */
  mfaToken?: string
}

export type AuthResponseMapper = (raw: unknown) => MappedAuthResponse

/** A request body: JSON, or form-encoded for a backend that wants that. */
export type AuthRequestBody = Record<string, unknown> | URLSearchParams | FormData

/** How responses and the refresh request are translated. Every member is optional. */
export interface AuthMapping {
  /** Login, register, magic-link verify, MFA verify and the OAuth code exchange. */
  mapAuthResponse?: AuthResponseMapper
  /** The refresh response. Defaults to `mapAuthResponse`. */
  mapRefreshResponse?: AuthResponseMapper
  /** The backend's user record → `User`. The result is validated either way. */
  mapUser?: (raw: unknown) => UserInput
  /** The body of a refresh that presents a token. Defaults to `{ refreshToken }`. */
  buildRefreshBody?: (refreshToken: string) => AuthRequestBody
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** One thing wrong with a body, in the shape `authContractMismatch` takes. */
const issue = (path: string, message: string) => [{ path: [path], code: 'custom', message }]

function record(raw: unknown, what: string): Record<string, unknown> {
  if (!isRecord(raw)) throw authContractMismatch(what, issue('', 'expected a JSON object'))
  return raw
}

const stringOrUndefined = (value: unknown) =>
  typeof value === 'string' && value !== '' ? value : undefined

/** A lifetime in seconds. Token endpoints are known to send it as a string. */
function seconds(value: unknown): number | undefined {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined
}

/** Drop the keys a mapper had nothing for, so they read as absent. */
function compact(mapped: MappedAuthResponse): MappedAuthResponse {
  return Object.fromEntries(Object.entries(mapped).filter(([, value]) => value !== undefined))
}

function requireAccessToken(body: Record<string, unknown>, what: string): string {
  const token = stringOrUndefined(body.access_token)
  if (!token) throw authContractMismatch(what, issue('access_token', 'expected a string'))
  return token
}

/**
 * Response mappers for the shapes backends actually use.
 *
 *   vuestrata — `{ user, token, refreshToken?, expiresIn? }`. The default; the
 *               body is used as it is.
 *   snakeCase — `{ access_token, refresh_token?, expires_in?, token_type?,
 *               user?, mfa_required?, mfa_token? }`.
 *   oauthToken — an OAuth 2.0 token endpoint (RFC 6749 §5.1): `access_token`,
 *               `token_type` (must be Bearer), `expires_in?`, `refresh_token?`.
 *               It never carries a user, so the app asks the `me` endpoint.
 *
 * Arrow properties, not methods: a project passes one by reference
 * (`mapAuthResponse: authResponseMappers.snakeCase`), and they use no `this`.
 */
export const authResponseMappers = {
  vuestrata: (raw: unknown): MappedAuthResponse => record(raw, 'The auth response'),

  snakeCase: (raw: unknown): MappedAuthResponse => {
    const body = record(raw, 'The auth response')
    const mfaRequired = body.mfa_required === true
    return compact({
      user: body.user ?? undefined,
      // An MFA challenge is the one answer that carries no access token yet.
      token: mfaRequired
        ? stringOrUndefined(body.access_token)
        : requireAccessToken(body, 'The auth response'),
      refreshToken: stringOrUndefined(body.refresh_token),
      expiresIn: seconds(body.expires_in),
      mfaRequired: mfaRequired || undefined,
      mfaToken: stringOrUndefined(body.mfa_token),
    })
  },

  oauthToken: (raw: unknown): MappedAuthResponse => {
    const body = record(raw, 'The token response')
    const type = body.token_type
    if (typeof type !== 'string' || type.toLowerCase() !== 'bearer') {
      throw authContractMismatch('The token response', issue('token_type', 'expected "Bearer"'))
    }
    return compact({
      token: requireAccessToken(body, 'The token response'),
      refreshToken: stringOrUndefined(body.refresh_token),
      expiresIn: seconds(body.expires_in),
    })
  },
} satisfies Record<string, AuthResponseMapper>

/**
 * Bodies for a refresh that presents a token, to pair with the mappers above.
 * `oauthToken` is form-encoded, as a token endpoint requires.
 */
export const authRefreshBodies = {
  vuestrata: (refreshToken: string): AuthRequestBody => ({ refreshToken }),
  snakeCase: (refreshToken: string): AuthRequestBody => ({ refresh_token: refreshToken }),
  oauthToken: (refreshToken: string): AuthRequestBody =>
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
} satisfies Record<string, (refreshToken: string) => AuthRequestBody>

// ─── The calls ────────────────────────────────────────────────────────────────

/**
 * What every auth call shares.
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
 *   backend's CORS must therefore allow credentials on these endpoints. A
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

/** Raised when a caller reaches for an endpoint the project switched off. */
export class AuthEndpointDisabledError extends Error {
  constructor(public readonly endpoint: AuthEndpointName) {
    super(
      `The "${endpoint}" auth endpoint is switched off in auth.config.ts. Check the adapter's ` +
        'capabilities before calling this.',
    )
    this.name = 'AuthEndpointDisabledError'
  }
}

/** The wire calls every built-in adapter shares, for one endpoint table. */
export interface AuthEndpoints {
  /** The table these calls were built from. Adapters derive capabilities from it. */
  readonly spec: AuthEndpointSpec
  login: (credentials: AuthCredentials) => Promise<AuthResponse>
  register: (data: AuthCredentials & { name: string }) => Promise<AuthResponse>
  logout: () => Promise<void>
  getUser: () => Promise<User | null>
  getUserAs: (token: string) => Promise<User>
  refreshToken: (token: string) => Promise<AuthResponse>
  refreshWithToken: (token: string) => Promise<RefreshedSession>
  resumeWithRefreshCookie: () => Promise<RefreshedSession>
  sendMagicLink: (request: MagicLinkRequest) => Promise<{ message: string }>
  verifyMagicLink: (token: string) => Promise<AuthResponse>
  setupMfa: () => Promise<MfaSetupResponse>
  verifyMfa: (request: MfaVerifyRequest) => Promise<AuthResponse>
  disableMfa: () => Promise<void>
  exchangeCode: (body: {
    code: string
    code_verifier: string
    redirect_uri: string
  }) => Promise<AuthResponse>
}

/**
 * Build the wire calls for an endpoint table and a set of mappers.
 *
 * With no arguments this is the documented Vuestrata contract, request for
 * request (`test/integration/auth/default-wire-contract.test.ts` holds it to
 * that). A project changes paths, methods and shapes from
 * `app/config/auth.config.ts`; nothing here is edited to integrate a backend.
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
export function createAuthEndpoints(
  overrides: AuthEndpointOverrides = {},
  mapping: AuthMapping = {},
): AuthEndpoints {
  const spec = resolveAuthEndpoints(overrides)
  const mapAuth = mapping.mapAuthResponse ?? authResponseMappers.vuestrata
  const mapRefresh = mapping.mapRefreshResponse ?? mapAuth
  const refreshBody = mapping.buildRefreshBody ?? authRefreshBodies.vuestrata

  /** One request to a named endpoint; rejects when that endpoint is switched off. */
  function request<T>(name: AuthEndpointName, options: ApiFetchOptions<'json'> = {}): Promise<T> {
    const endpoint = spec[name]
    if (!endpoint) return Promise.reject(new AuthEndpointDisabledError(name))
    return apiFetch<T>(
      endpoint.path,
      authCall({ ...(endpoint.method ? { method: endpoint.method } : {}), ...options }),
    )
  }

  /** A refresh, with whatever `options` say about the credential. */
  const refresh = (options: ApiFetchOptions<'json'>) =>
    request<unknown>('refresh', { onRequest: withoutAccessToken, ...options })

  /**
   * Run a project's mapper. Anything it throws that is not already an
   * `AppError` is a body it could not read, which is a contract mismatch, not
   * a crash in the login form.
   */
  function mapped<T>(what: string, run: () => T): T {
    try {
      return run()
    } catch (err) {
      if (err instanceof AppError) throw err
      throw authContractMismatch(what, issue('', err instanceof Error ? err.message : String(err)))
    }
  }

  /** The backend's user record, mapped and held to the `User` schema. */
  function toUser(raw: unknown, what: string): User {
    const mapUser = mapping.mapUser
    return parseUser(mapUser ? mapped(what, () => mapUser(raw)) : raw, what)
  }

  const getUser = async (): Promise<User | null> => {
    const raw = await request<unknown>('me')
    return raw === null || raw === undefined ? null : toUser(raw, 'The current user')
  }

  /**
   * The `me` endpoint as the holder of `token`, before the store has one.
   *
   * The token is passed explicitly because a session resume runs at boot, when
   * the store is empty and the interceptor would send no `Authorization`. The
   * interceptor leaves a header the caller set alone.
   */
  const getUserAs = async (token: string): Promise<User> =>
    toUser(
      await request<unknown>('me', { headers: { Authorization: `Bearer ${token}` } }),
      'The current user',
    )

  /**
   * A response that starts a session, in the app's shape and with a user.
   *
   * A backend that answers a login with tokens alone (an OAuth token endpoint
   * always does) is asked who that is, as the holder of the token it just
   * issued. An MFA challenge is passed on as it is: there is no session yet.
   */
  async function session(raw: unknown, what: string): Promise<AuthResponse> {
    const { user, ...rest } = record(
      mapped(what, () => mapAuth(raw)),
      what,
    ) as MappedAuthResponse

    // Under bearer transport the token IS the session: the store counts a
    // user as signed in only while it holds one. A response with a user and no
    // token would leave somebody in the header whom every request then
    // presents as nobody. Only an MFA challenge comes without one, and only
    // cookie transport never has one. `snakeCase` and `oauthToken` check
    // their own field; this holds for every mapper, a project's included.
    if (!rest.mfaRequired && getAuthTransport() === 'bearer' && !stringOrUndefined(rest.token)) {
      throw authContractMismatch(what, issue('token', 'expected a non-empty string'))
    }

    if (user !== null && user !== undefined) {
      return { ...rest, user: toUser(user, `${what}'s user`) } as AuthResponse
    }
    if (rest.mfaRequired) return rest as AuthResponse

    const fetched = rest.token ? await getUserAs(rest.token) : await getUser()
    if (!fetched) {
      throw authContractMismatch(what, issue('user', 'no user in the response, or from `me`'))
    }
    return { ...rest, user: fetched } as AuthResponse
  }

  /** A refresh response, in the app's shape. Its `user` is optional. */
  function refreshed(raw: unknown): RefreshedSession {
    const what = 'The refresh response'
    const { user, ...rest } = record(
      mapped(what, () => mapRefresh(raw)),
      what,
    ) as MappedAuthResponse
    return (
      user === null || user === undefined ? rest : { ...rest, user: toUser(user, `${what}'s user`) }
    ) as RefreshedSession
  }

  const refreshWithToken = async (token: string): Promise<RefreshedSession> =>
    refreshed(await refresh({ body: mapped('The refresh request', () => refreshBody(token)) }))

  // Arrow properties rather than method shorthand: adapters assign these
  // directly (`login: endpoints.login`), and an unbound method reference would
  // be a `this`-dependent footgun. Arrows have no `this` to lose.
  return {
    spec,

    login: async (credentials) =>
      session(await request<unknown>('login', { body: credentials }), 'The login response'),

    register: async (data) =>
      session(await request<unknown>('register', { body: data }), 'The registration response'),

    logout: async () => {
      // A backend with no logout endpoint (stateless tokens) has nothing to be
      // told: ending the session is the client forgetting it.
      if (!spec.logout) return
      // A backend logout failure must never block client-side cleanup — the user
      // has already decided to end the session — but it should stay visible in
      // logs so operators can spot a stuck endpoint.
      await request('logout').catch((err) => {
        authLogger.warn('Logout API call failed (clearing local session anyway)', { err })
      })
    },

    getUser,
    getUserAs,

    /**
     * Trade a refresh token held by JavaScript for a new access token.
     *
     * Typed `AuthResponse` because the adapter contract's `refreshToken` always
     * was; the documented response carries no `user`. New code calls
     * `refreshWithToken`, which says so.
     */
    refreshToken: async (token) => (await refreshWithToken(token)) as AuthResponse,

    /** `refreshToken`, typed as what the refresh endpoint actually returns. */
    refreshWithToken,

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
    resumeWithRefreshCookie: async () => refreshed(await refresh({ credentials: 'include' })),

    sendMagicLink: (body) => request<{ message: string }>('magicLink', { body }),

    verifyMagicLink: async (token) =>
      session(
        await request<unknown>('magicLinkVerify', { body: { token } }),
        'The magic-link response',
      ),

    setupMfa: () => request<MfaSetupResponse>('mfaSetup'),

    verifyMfa: async (body) =>
      session(await request<unknown>('mfaVerify', { body }), 'The MFA response'),

    disableMfa: async () => {
      await request('mfaDisable')
    },

    exchangeCode: async (body) =>
      session(
        await request<unknown>('token', { body: { grant_type: 'authorization_code', ...body } }),
        'The token response',
      ),
  }
}
