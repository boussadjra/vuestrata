import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { AuthConfig, AuthEndpoints } from '@/lib/auth'
import type { AppError } from '~/lib/errors'

/**
 * Response shapes and the user contract.
 *
 * Two things a backend integration needs and the adapters never had: a way to
 * say "my login answers `{ access_token, refresh_token, expires_in }`", and a
 * check that what arrives as the user really is one. Domain records were
 * validated against a zod schema; the object that decides what a visitor may
 * see was passed straight through.
 */

type Auth = typeof import('@/lib/auth')

/** The backend. Each test says what it answers. */
const apiFetch = vi.fn(async (_path: string, _options?: object): Promise<unknown> => undefined)

/** The seam's helpers, `~/lib/auth`, from the fresh module graph. */
let auth: Auth
let createAuthAdapter: typeof import('@/modules/auth').createAuthAdapter
/** `AppError` as the freshly loaded modules know it, for `instanceof`. */
let FreshAppError: typeof AppError
let logged: ReturnType<typeof vi.fn>
/** How the session in force proves identity. A test of a cookie session says so. */
let transport: 'bearer' | 'cookie'

beforeEach(async () => {
  vi.resetModules()
  apiFetch.mockReset()
  logged = vi.fn()
  transport = 'bearer'
  vi.doMock('~/lib/api/client', () => ({ apiFetch }))
  vi.doMock('~/lib/api/auth-interceptor', () => ({ getAuthTransport: () => transport }))
  vi.doMock('~/lib/logger', () => {
    const scoped = { info: vi.fn(), warn: vi.fn(), error: logged, debug: vi.fn() }
    return { logger: scoped, createScopedLogger: () => scoped }
  })

  auth = await import('@/lib/auth')
  ;({ createAuthAdapter } = await import('@/modules/auth'))
  ;({ AppError: FreshAppError } = await import('~/lib/errors'))
  const { runtimeEnv } = await import('~/lib/config')
  runtimeEnv.sessionPersistence = 'none'
})

afterEach(() => {
  vi.doUnmock('~/lib/api/client')
  vi.doUnmock('~/lib/api/auth-interceptor')
  vi.doUnmock('~/lib/logger')
})

/** The wire calls for a configuration, as the built-in adapters get them. */
const endpoints = (config: AuthConfig = {}) => auth.resolveAuthConfig(config).endpoints

const user = { id: 'u1', email: 'ada@example.test', name: 'Ada Lovelace', role: 'manager' }

/** A backend that names everything differently, and its mapper. */
const backendUser = {
  uid: 7,
  mail: 'ada@example.test',
  given_name: 'Ada',
  family_name: 'Lovelace',
  roles: ['manager'],
}
const mapUser = (raw: unknown) => {
  const record = raw as typeof backendUser
  return {
    id: record.uid,
    email: record.mail,
    name: `${record.given_name} ${record.family_name}`,
    role: record.roles[0] ?? 'guest',
  }
}
const mapped = { id: '7', email: 'ada@example.test', name: 'Ada Lovelace', role: 'manager' }

async function contractError(run: () => Promise<unknown>) {
  const error = await run().then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(FreshAppError)
  return error as AppError
}

describe('the shipped response mappers', () => {
  it('vuestrata takes the body as it is', () => {
    const body = { user, token: 'access', refreshToken: 'refresh', expiresIn: 900 }

    expect(auth.authResponseMappers.vuestrata(body)).toBe(body)
  })

  it('snakeCase reads access_token, refresh_token and expires_in', () => {
    expect(
      auth.authResponseMappers.snakeCase({
        access_token: 'access',
        refresh_token: 'refresh',
        expires_in: 900,
        token_type: 'Bearer',
        user,
      }),
    ).toEqual({ user, token: 'access', refreshToken: 'refresh', expiresIn: 900 })
  })

  it('snakeCase leaves out what the backend left out', () => {
    expect(auth.authResponseMappers.snakeCase({ access_token: 'access' })).toEqual({
      token: 'access',
    })
  })

  it('snakeCase passes an MFA challenge on, which carries no access token yet', () => {
    expect(
      auth.authResponseMappers.snakeCase({ mfa_required: true, mfa_token: 'challenge' }),
    ).toEqual({ mfaRequired: true, mfaToken: 'challenge' })
  })

  it('snakeCase refuses a response with no access token', () => {
    expect(() => auth.authResponseMappers.snakeCase({ token: 'camelCase-backend' })).toThrow(
      FreshAppError,
    )
    expect(() => auth.authResponseMappers.snakeCase('nope')).toThrow(FreshAppError)
  })

  it('oauthToken reads an RFC 6749 token response, which never carries a user', () => {
    expect(
      auth.authResponseMappers.oauthToken({
        access_token: 'access',
        token_type: 'bearer',
        // Token endpoints are known to send the lifetime as a string.
        expires_in: '3600',
        refresh_token: 'refresh',
        scope: 'openid profile',
        user: { ignored: true },
      }),
    ).toEqual({ token: 'access', refreshToken: 'refresh', expiresIn: 3600 })
  })

  it('oauthToken refuses a token type the API client cannot present', () => {
    expect(() =>
      auth.authResponseMappers.oauthToken({ access_token: 'access', token_type: 'mac' }),
    ).toThrow(FreshAppError)
    expect(() => auth.authResponseMappers.oauthToken({ access_token: 'access' })).toThrow(
      FreshAppError,
    )
  })

  it('pairs each with the body its refresh presents', () => {
    expect(auth.authRefreshBodies.vuestrata('held')).toEqual({ refreshToken: 'held' })
    expect(auth.authRefreshBodies.snakeCase('held')).toEqual({ refresh_token: 'held' })

    const form = auth.authRefreshBodies.oauthToken('held')
    expect(form).toBeInstanceOf(URLSearchParams)
    expect((form as URLSearchParams).toString()).toBe('grant_type=refresh_token&refresh_token=held')
  })
})

describe('a snake_case backend', () => {
  const config: AuthConfig = {
    mapAuthResponse: (raw) => auth.authResponseMappers.snakeCase(raw),
    buildRefreshBody: (token) => auth.authRefreshBodies.snakeCase(token),
  }

  it('signs in', async () => {
    apiFetch.mockResolvedValue({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 900,
      token_type: 'Bearer',
      user,
    })

    await expect(endpoints(config).login({ email: user.email, password: 'pw' })).resolves.toEqual({
      user,
      token: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    })
  })

  it('refreshes with its own body, and has the answer read by the same mapper', async () => {
    apiFetch.mockResolvedValue({
      access_token: 'access-2',
      refresh_token: 'refresh-2',
      expires_in: 600,
    })

    // `mapRefreshResponse` was not given: it defaults to `mapAuthResponse`.
    await expect(endpoints(config).refreshWithToken('refresh-1')).resolves.toEqual({
      token: 'access-2',
      refreshToken: 'refresh-2',
      expiresIn: 600,
    })
    expect(apiFetch.mock.calls[0]?.[1]).toMatchObject({ body: { refresh_token: 'refresh-1' } })
  })

  it('refreshes from a cookie with no body at all', async () => {
    apiFetch.mockResolvedValue({ access_token: 'access-2', expires_in: 600 })

    await expect(endpoints(config).resumeWithRefreshCookie()).resolves.toEqual({
      token: 'access-2',
      expiresIn: 600,
    })
    expect(apiFetch.mock.calls[0]?.[1]).not.toHaveProperty('body')
  })

  it('may read its refresh response differently from its login response', async () => {
    apiFetch.mockResolvedValue({ jwt: 'access-2' })
    const calls = endpoints({
      ...config,
      mapRefreshResponse: (raw) => ({ token: (raw as { jwt: string }).jwt }),
    })

    await expect(calls.refreshWithToken('held')).resolves.toEqual({ token: 'access-2' })
  })

  it('completes an MFA challenge the way a camelCase backend does', async () => {
    apiFetch.mockResolvedValue({ mfa_required: true, mfa_token: 'challenge' })

    // No user and no token: the session does not exist yet, and nothing asks
    // the backend who it belongs to.
    await expect(endpoints(config).login({ email: user.email, password: 'pw' })).resolves.toEqual({
      mfaRequired: true,
      mfaToken: 'challenge',
    })
    expect(apiFetch).toHaveBeenCalledOnce()
  })
})

describe('a login that answers with tokens and no user', () => {
  it('asks the me endpoint, as the holder of the token it was just given', async () => {
    apiFetch.mockImplementation(async (path) =>
      path === '/users/me' ? backendUser : { access_token: 'access', token_type: 'Bearer' },
    )
    const calls = endpoints({
      endpoints: { me: '/users/me' },
      mapAuthResponse: (raw) => auth.authResponseMappers.oauthToken(raw),
      mapUser,
    })

    await expect(calls.login({ email: user.email, password: 'pw' })).resolves.toEqual({
      user: mapped,
      token: 'access',
    })
    expect(apiFetch.mock.calls[1]).toEqual([
      '/users/me',
      { skipAuthRefresh: true, headers: { Authorization: 'Bearer access' } },
    ])
  })

  it('asks without a token under a cookie session, where the cookie is the credential', async () => {
    transport = 'cookie'
    apiFetch.mockImplementation(async (path) => (path === '/auth/me' ? user : {}))

    await expect(
      endpoints().exchangeCode({ code: 'c', code_verifier: 'v', redirect_uri: 'r' }),
    ).resolves.toEqual({ user })
    expect(apiFetch.mock.calls[1]).toEqual(['/auth/me', { skipAuthRefresh: true }])
  })

  it('is a contract mismatch when neither says who signed in', async () => {
    // A cookie session: there is no token to miss, only the user.
    transport = 'cookie'
    apiFetch.mockImplementation(async (path) => (path === '/auth/me' ? null : {}))

    const error = await contractError(() =>
      endpoints().login({ email: user.email, password: 'pw' }),
    )

    expect(error.code).toBe('CONTRACT_MISMATCH')
    expect(Object.keys(error.details ?? {})).toEqual(['user'])

    // With a token in hand, the answer to "who is this" has to be a user.
    transport = 'bearer'
    apiFetch.mockImplementation(async (path) => (path === '/auth/me' ? null : { token: 'access' }))
    const withToken = await contractError(() =>
      endpoints().login({ email: user.email, password: 'pw' }),
    )
    expect(withToken.code).toBe('CONTRACT_MISMATCH')
  })
})

describe('a bearer session without a token', () => {
  // The default mapper takes the body as it is, so nothing had checked this:
  // a login answering `{ user }` alone put a user in the store with no token,
  // signed in to nothing.
  it.each([
    ['no token', { user }],
    ['an empty token', { user, token: '' }],
    ['a token that is not a string', { user, token: 42 }],
  ])('is a contract mismatch for a login that answers with %s', async (_case, body) => {
    apiFetch.mockResolvedValue(body)

    const error = await contractError(() =>
      endpoints().login({ email: user.email, password: 'pw' }),
    )

    expect(error.code).toBe('CONTRACT_MISMATCH')
    expect(Object.keys(error.details ?? {})).toEqual(['token'])
    // Refused before anybody is asked who signed in.
    expect(apiFetch).toHaveBeenCalledOnce()
  })

  it('holds for a mapper of the project’s own', async () => {
    apiFetch.mockResolvedValue({ data: { account: user } })
    const calls = endpoints({
      mapAuthResponse: (raw) => ({ user: (raw as { data: { account: unknown } }).data.account }),
    })

    const error = await contractError(() => calls.register({ ...user, password: 'pw' }))

    expect(Object.keys(error.details ?? {})).toEqual(['token'])
  })

  it('is still how an MFA challenge looks: there is no session yet', async () => {
    apiFetch.mockResolvedValue({ mfaRequired: true, mfaToken: 'challenge' })

    await expect(endpoints().login({ email: user.email, password: 'pw' })).resolves.toEqual({
      mfaRequired: true,
      mfaToken: 'challenge',
    })
  })

  it('is how every cookie session looks: the browser holds the credential', async () => {
    transport = 'cookie'
    apiFetch.mockResolvedValue({ user })

    await expect(endpoints().login({ email: user.email, password: 'pw' })).resolves.toEqual({
      user,
    })
  })
})

describe('mapUser', () => {
  const session = { user: backendUser, token: 'access' }

  // "Every place a user enters the app."
  it.each([
    ['login', (calls: AuthEndpoints) => calls.login({ email: 'a', password: 'b' })],
    [
      'register',
      (calls: AuthEndpoints) => calls.register({ email: 'a', password: 'b', name: 'c' }),
    ],
    ['magic-link verify', (calls: AuthEndpoints) => calls.verifyMagicLink('magic')],
    ['MFA verify', (calls: AuthEndpoints) => calls.verifyMfa({ mfaToken: 'mfa', code: '000000' })],
    [
      'the OAuth code exchange',
      (calls: AuthEndpoints) =>
        calls.exchangeCode({ code: 'c', code_verifier: 'v', redirect_uri: 'r' }),
    ],
  ])('is applied to the user of %s', async (_name, run) => {
    apiFetch.mockResolvedValue(session)

    await expect(run(endpoints({ mapUser }))).resolves.toEqual({ user: mapped, token: 'access' })
  })

  it('is applied to the me endpoint, with or without an explicit token', async () => {
    apiFetch.mockResolvedValue(backendUser)
    const calls = endpoints({ mapUser })

    await expect(calls.getUser()).resolves.toEqual(mapped)
    await expect(calls.getUserAs('fresh')).resolves.toEqual(mapped)
  })

  it('is applied to a user the refresh response chose to include', async () => {
    apiFetch.mockResolvedValue({ token: 'access-2', user: backendUser })
    const calls = endpoints({ mapUser })

    await expect(calls.refreshWithToken('held')).resolves.toEqual({
      token: 'access-2',
      user: mapped,
    })
    await expect(calls.resumeWithRefreshCookie()).resolves.toEqual({
      token: 'access-2',
      user: mapped,
    })
    await expect(calls.refreshToken('held')).resolves.toEqual({ token: 'access-2', user: mapped })
  })

  it('reaches a resumed session through the jwt adapter', async () => {
    const { runtimeEnv } = await import('~/lib/config')
    runtimeEnv.sessionPersistence = 'refresh-cookie'
    apiFetch.mockImplementation(async (path) =>
      path === '/auth/me' ? backendUser : { token: 'access-2', expiresIn: 900 },
    )
    auth.installAuthConfig(auth.resolveAuthConfig({ mapUser }))

    await expect(createAuthAdapter('jwt').resumeSession!()).resolves.toEqual({
      user: mapped,
      token: 'access-2',
      expiresIn: 900,
    })
  })

  it('leaves a signed-out answer from the me endpoint as it is', async () => {
    apiFetch.mockResolvedValue(null)
    const map = vi.fn(mapUser)

    await expect(endpoints({ mapUser: map }).getUser()).resolves.toBeNull()
    expect(map).not.toHaveBeenCalled()
  })

  it('that throws on a payload it cannot read is a contract mismatch, not a crash', async () => {
    apiFetch.mockResolvedValue({ unexpected: true })

    // `roles[0]` of undefined: a TypeError inside the project's mapper.
    const error = await contractError(() => endpoints({ mapUser }).getUser())

    expect(error.code).toBe('CONTRACT_MISMATCH')
    expect(error.kind).toBe('contract')
  })
})

describe('the User contract', () => {
  it('rejects a user payload that has drifted, saying which fields', async () => {
    apiFetch.mockResolvedValue({ id: 'u1', email: 'ada@example.test', permissions: 'all' })

    const error = await contractError(() => endpoints().getUser())

    expect(error.code).toBe('CONTRACT_MISMATCH')
    expect(error.kind).toBe('contract')
    expect(error.retryable).toBe(false)
    expect(error.messageKey).toBe('errors.contract')
    expect(Object.keys(error.details ?? {})).toEqual(['permissions'])
  })

  it('rejects it at sign-in too, before anything reaches the store', async () => {
    apiFetch.mockResolvedValue({ user: { id: 'u1' }, token: 'access' })

    const error = await contractError(() => endpoints().login({ email: 'a', password: 'b' }))

    expect(Object.keys(error.details ?? {})).toEqual(['email'])
  })

  it('rejects what a mapper returns as readily as what a backend sends', async () => {
    apiFetch.mockResolvedValue(backendUser)
    const calls = endpoints({
      mapUser: () => ({ id: '', email: 'a@b.test', name: 'A', role: 'x' }),
    })

    const error = await contractError(() => calls.getUser())

    expect(Object.keys(error.details ?? {})).toEqual(['id'])
  })

  it('logs where the payload was wrong, and never the payload', async () => {
    apiFetch.mockResolvedValue({ id: 'u1', email: 'secret@example.test', name: 12, role: 'viewer' })

    await contractError(() => endpoints().getUser())

    expect(logged).toHaveBeenCalledOnce()
    expect(JSON.stringify(logged.mock.calls)).toContain('"path":"name"')
    // An identity payload is personal data.
    expect(JSON.stringify(logged.mock.calls)).not.toContain('secret@example.test')
  })

  it('keeps fields it does not know, so a project can widen User', () => {
    expect(auth.parseUser({ ...user, tenantId: 't1', locale: 'fr' })).toEqual({
      ...user,
      tenantId: 't1',
      locale: 'fr',
    })
  })

  it('reads null on an optional field as absent, and a numeric id as a string', () => {
    const parsed = auth.parseUser({
      ...user,
      id: 42,
      avatar: null,
      permissions: null,
      emailVerified: null,
      lastLoginAt: null,
    })

    expect(parsed).toEqual({ ...user, id: '42' })
    expect(Object.keys(parsed).sort()).toEqual(['email', 'id', 'name', 'role'])
  })

  it('takes any role: which roles exist is the RBAC layer’s question', () => {
    expect(auth.parseUser({ ...user, role: 'billing_admin' }).role).toBe('billing_admin')
  })

  // The app signed these users in before identity was validated: the store
  // read a missing role as `guest`, and the header showed no name. A release
  // must not end every sign-in of a deployment whose backend never sent them.
  it.each([
    ['no role', { id: 'u1', email: 'ada@example.test', name: 'Ada' }],
    ['a null role', { id: 'u1', email: 'ada@example.test', name: 'Ada', role: null }],
    ['an empty role', { id: 'u1', email: 'ada@example.test', name: 'Ada', role: '' }],
  ])('signs in a user with %s, and leaves the role absent', (_case, payload) => {
    const parsed = auth.parseUser(payload)

    // Absent, not `guest`: the store and `useRbac` read that as guest for
    // role checks, and it holds no permission. Writing `guest` here would
    // hand such a user what the guest role grants.
    expect(parsed).toEqual({ id: 'u1', email: 'ada@example.test', name: 'Ada' })
    expect(parsed).not.toHaveProperty('role')
  })

  it.each([
    ['no name', { id: 'u1', email: 'ada@example.test', role: 'viewer' }],
    ['a null name', { id: 'u1', email: 'ada@example.test', role: 'viewer', name: null }],
  ])('shows the email for a user with %s', (_case, payload) => {
    expect(auth.parseUser(payload).name).toBe('ada@example.test')
  })

  it('keeps an empty name the backend chose to send', () => {
    expect(auth.parseUser({ ...user, name: '' }).name).toBe('')
  })

  it.each([
    ['no id', { ...user, id: undefined }],
    ['an empty id', { ...user, id: '' }],
    ['no email', { ...user, email: '' }],
    ['a name that is not a string', { ...user, name: 12 }],
    ['a role that is an array', { ...user, role: ['super_admin'] }],
    ['a role that is not a string', { ...user, role: 1 }],
    ['permissions that are not an array', { ...user, permissions: 'users:delete' }],
    ['permissions that are not strings', { ...user, permissions: [1, 2] }],
    ['a flag that is not a boolean', { ...user, mfaEnabled: 'yes' }],
    ['something that is not an object', 'ada'],
    ['nothing', null],
  ])('rejects %s', (_case, payload) => {
    expect(() => auth.parseUser(payload)).toThrow(FreshAppError)
  })
})

describe('an adapter of the project’s own', () => {
  it('logs one contract error for a user that does not fit, and never the payload', async () => {
    const announced = { email: 'secret@example.test', role: ['super_admin'] }
    auth.installAuthConfig(
      auth.resolveAuthConfig({
        adapters: {
          own: () => ({
            name: 'own',
            transport: 'bearer',
            capabilities: {
              register: false,
              social: false,
              magicLink: false,
              mfa: false,
              refresh: false,
              codeExchange: false,
            },
            login: async () => ({ user: announced, token: 'access' }) as never,
            logout: async () => {},
            getUser: async () => announced as never,
          }),
        },
      }),
    )
    const adapter = createAuthAdapter('own')

    await contractError(() => adapter.login({ email: 'a', password: 'b' }))

    expect(logged).toHaveBeenCalledOnce()
    const line = JSON.stringify(logged.mock.calls)
    expect(line).toContain('"path":"id"')
    expect(line).toContain('"path":"role"')
    expect(line).not.toContain('secret@example.test')
    expect(line).not.toContain('super_admin')

    // "Nobody", and one more line, from the call that answers with a user alone.
    await expect(adapter.getUser()).resolves.toBeNull()
    expect(logged).toHaveBeenCalledTimes(2)
  })
})

describe('a response that is not what a mapper can read', () => {
  it('is a contract mismatch for the default shape too', async () => {
    apiFetch.mockResolvedValue('<html>Bad gateway</html>')

    const error = await contractError(() => endpoints().login({ email: 'a', password: 'b' }))

    expect(error.code).toBe('CONTRACT_MISMATCH')
  })

  it('is a contract mismatch when the project’s mapper throws', async () => {
    apiFetch.mockResolvedValue({ data: null })
    const calls = endpoints({
      mapAuthResponse: (raw) => ({ token: (raw as { data: { jwt: string } }).data.jwt }),
    })

    const error = await contractError(() => calls.login({ email: 'a', password: 'b' }))

    expect(error.code).toBe('CONTRACT_MISMATCH')
  })

  it('is a contract mismatch when the mapper returns no object', async () => {
    apiFetch.mockResolvedValue({ token: 'access' })
    const calls = endpoints({ mapRefreshResponse: () => undefined as never })

    const error = await contractError(() => calls.refreshWithToken('held'))

    expect(error.code).toBe('CONTRACT_MISMATCH')
  })
})
