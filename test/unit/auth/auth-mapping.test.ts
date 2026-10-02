import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { AuthConfig } from '@/modules/auth'
import type { AuthEndpoints } from '@/modules/auth/adapters/endpoints'
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

type Auth = typeof import('@/modules/auth')

/** The backend. Each test says what it answers. */
const apiFetch = vi.fn(async (_path: string, _options?: object): Promise<unknown> => undefined)

let auth: Auth
let resolveAuthConfig: typeof import('@/modules/auth/adapters/config').resolveAuthConfig
/** `AppError` as the freshly loaded modules know it, for `instanceof`. */
let FreshAppError: typeof AppError
let logged: ReturnType<typeof vi.fn>

beforeEach(async () => {
  vi.resetModules()
  apiFetch.mockReset()
  logged = vi.fn()
  vi.doMock('~/lib/api/client', () => ({ apiFetch }))
  vi.doMock('~/lib/logger', () => {
    const scoped = { info: vi.fn(), warn: vi.fn(), error: logged, debug: vi.fn() }
    return { logger: scoped, createScopedLogger: () => scoped }
  })

  auth = await import('@/modules/auth')
  ;({ resolveAuthConfig } = await import('@/modules/auth/adapters/config'))
  ;({ AppError: FreshAppError } = await import('~/lib/errors'))
  const { runtimeEnv } = await import('~/lib/config')
  runtimeEnv.sessionPersistence = 'none'
})

afterEach(() => {
  vi.doUnmock('~/lib/api/client')
  vi.doUnmock('~/lib/logger')
})

/** The wire calls for a configuration, as the built-in adapters get them. */
const endpoints = (config: AuthConfig = {}) => resolveAuthConfig(config).endpoints

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
    apiFetch.mockImplementation(async (path) => (path === '/auth/me' ? user : {}))

    await expect(
      endpoints().exchangeCode({ code: 'c', code_verifier: 'v', redirect_uri: 'r' }),
    ).resolves.toEqual({ user })
    expect(apiFetch.mock.calls[1]).toEqual(['/auth/me', { skipAuthRefresh: true }])
  })

  it('is a contract mismatch when neither says who signed in', async () => {
    apiFetch.mockImplementation(async (path) => (path === '/auth/me' ? null : {}))

    const error = await contractError(() =>
      endpoints().login({ email: user.email, password: 'pw' }),
    )

    expect(error.code).toBe('CONTRACT_MISMATCH')
    expect(Object.keys(error.details ?? {})).toEqual(['user'])

    // With a token in hand, the answer to "who is this" has to be a user.
    apiFetch.mockImplementation(async (path) => (path === '/auth/me' ? null : { token: 'access' }))
    const withToken = await contractError(() =>
      endpoints().login({ email: user.email, password: 'pw' }),
    )
    expect(withToken.code).toBe('CONTRACT_MISMATCH')
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
    auth.installAuthConfig({ mapUser })

    await expect(auth.createAuthAdapter('jwt').resumeSession!()).resolves.toEqual({
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
    expect(Object.keys(error.details ?? {}).sort()).toEqual(['name', 'permissions', 'role'])
  })

  it('rejects it at sign-in too, before anything reaches the store', async () => {
    apiFetch.mockResolvedValue({ user: { id: 'u1' }, token: 'access' })

    const error = await contractError(() => endpoints().login({ email: 'a', password: 'b' }))

    expect(Object.keys(error.details ?? {}).sort()).toEqual(['email', 'name', 'role'])
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

  it('takes any non-empty role: which roles exist is the RBAC layer’s question', () => {
    expect(auth.parseUser({ ...user, role: 'billing_admin' }).role).toBe('billing_admin')
    expect(() => auth.parseUser({ ...user, role: '' })).toThrow(FreshAppError)
  })

  it.each([
    ['no id', { ...user, id: undefined }],
    ['no email', { ...user, email: '' }],
    ['no name', { ...user, name: undefined }],
    ['permissions that are not strings', { ...user, permissions: [1, 2] }],
    ['a flag that is not a boolean', { ...user, mfaEnabled: 'yes' }],
    ['something that is not an object', 'ada'],
    ['nothing', null],
  ])('rejects %s', (_case, payload) => {
    expect(() => auth.parseUser(payload)).toThrow(FreshAppError)
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
