import 'fake-indexeddb/auto'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test'

import { usersHandlers } from '@/mocks/handlers/users'
import { createMockJwt } from '@/mocks/utils'
import { authMockHandlers } from '@/modules/auth/mocks/auth.handlers'
import { getDemoSession, getDemoUsers, setDemoUsers } from '@/state/demo-store'
import { DEMO_ACCOUNT } from '@/state/demo/account'
import type { Permission, User } from '@/types'

import {
  ALL_TEST_PERMISSIONS,
  createAuthTestUser,
  resetDemoData,
  resetDemoGlobals,
  seedDemoSession,
} from '../../utils/auth-test-helpers'

const server = setupServer(...authMockHandlers, ...usersHandlers)
const AUTH_HEADER = {
  Authorization: `Bearer ${createMockJwt({ sub: 'test-user' })}`,
}

function jsonHeaders(extra?: HeadersInit): HeadersInit {
  const headers = new Headers(extra)
  headers.set('Content-Type', 'application/json')
  return headers
}

// Handlers are anchored to the API base path (`VUESTRATA_API_URL`, `/api` by
// default) so the mock backend cannot claim unrelated same-origin URLs — the
// app's own source files in dev, or a hard reload of a detail route. Requests
// here go through the same mount point the app uses.
const API_ORIGIN = 'http://localhost/api'

async function jsonRequest(path: string, init: RequestInit = {}) {
  return fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers: jsonHeaders(init.headers),
  })
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

let adminUser: User
let memberUser: User

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

beforeEach(async () => {
  await resetDemoData()
  adminUser = createAuthTestUser({
    id: 'admin-1',
    email: 'demo@vuestrata.dev',
    name: 'Demo Admin',
    role: 'super_admin',
    permissions: ALL_TEST_PERMISSIONS,
  })
  memberUser = createAuthTestUser({
    id: 'member-1',
    email: 'member@example.test',
    name: 'Member User',
    role: 'member',
    permissions: ['users:read', 'dashboard:read'],
  })
  await setDemoUsers([adminUser, memberUser])
})

afterEach(async () => {
  server.resetHandlers()
  await resetDemoData()
  resetDemoGlobals()
})

afterAll(() => {
  server.close()
})

describe('auth MSW handlers', () => {
  it('POST /auth/login persists a demo session for existing users', async () => {
    const response = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: adminUser.email, password: DEMO_ACCOUNT.password }),
    })

    expect(response.status).toBe(200)
    const body = await parseJson<{ user: User; token: string; refreshToken: string }>(response)
    expect(body.user.email).toBe(adminUser.email)
    expect(body.token).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()

    const session = await getDemoSession()
    expect(session?.user.email).toBe(adminUser.email)
  })

  it('POST /auth/login rejects a wrong password for the seeded demo account', async () => {
    // The handler used to accept ANY non-empty password, so this path could
    // not be exercised at all and the login form was not demonstrating a login.
    const response = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: adminUser.email, password: 'not-the-password' }),
    })

    expect(response.status).toBe(401)
    await expect(getDemoSession()).resolves.toBeNull()
  })

  it('POST /auth/login rejects an empty password', async () => {
    const response = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: adminUser.email, password: '' }),
    })

    expect(response.status).toBe(401)
  })

  it('POST /auth/login rejects unknown users', async () => {
    const response = await jsonRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'missing@example.test', password: 'password' }),
    })

    expect(response.status).toBe(401)
    await expect(parseJson<{ code: string }>(response)).resolves.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
  })

  it('GET /auth/me requires a bearer token and active session', async () => {
    await seedDemoSession(adminUser)

    const unauthorized = await fetch(`${API_ORIGIN}/auth/me`)
    expect(unauthorized.status).toBe(401)

    const authorized = await fetch(`${API_ORIGIN}/auth/me`, { headers: AUTH_HEADER })
    expect(authorized.status).toBe(200)
    await expect(parseJson<User>(authorized)).resolves.toMatchObject({ id: adminUser.id })
  })

  it('POST /auth/logout clears the persisted demo session', async () => {
    await seedDemoSession(adminUser)

    const response = await jsonRequest('/auth/logout', { method: 'POST' })

    expect(response.status).toBe(204)
    await expect(getDemoSession()).resolves.toBeNull()
  })

  it('POST /auth/refresh returns 401 when there is no session', async () => {
    const response = await jsonRequest('/auth/refresh', { method: 'POST' })

    expect(response.status).toBe(401)
  })

  it('POST /auth/refresh mints fresh tokens for the current session', async () => {
    await seedDemoSession(adminUser)

    const response = await jsonRequest('/auth/refresh', { method: 'POST' })

    expect(response.status).toBe(200)
    const body = await parseJson<{ token: string; refreshToken: string; expiresIn: number }>(
      response,
    )
    expect(body.token).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()
    expect(body.expiresIn).toBe(3600)
  })

  it('POST /auth/magic-link/verify signs in the first persisted demo user', async () => {
    const response = await jsonRequest('/auth/magic-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token: 'magic-token' }),
    })

    expect(response.status).toBe(200)
    await expect(getDemoSession()).resolves.toMatchObject({ user: { id: adminUser.id } })
  })

  it('MFA setup requires auth and MFA verify persists an authenticated session', async () => {
    const setupUnauthorized = await jsonRequest('/auth/mfa/setup', { method: 'POST' })
    expect(setupUnauthorized.status).toBe(401)

    const setupAuthorized = await jsonRequest('/auth/mfa/setup', {
      method: 'POST',
      headers: AUTH_HEADER,
    })
    expect(setupAuthorized.status).toBe(200)
    await expect(
      parseJson<{ secret: string; backupCodes: string[] }>(setupAuthorized),
    ).resolves.toMatchObject({ secret: 'JBSWY3DPEHPK3PXP' })

    const invalid = await jsonRequest('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfaToken: 'token', code: 'bad' }),
    })
    expect(invalid.status).toBe(401)

    const valid = await jsonRequest('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ mfaToken: 'token', code: '000000' }),
    })
    expect(valid.status).toBe(200)
    await expect(getDemoSession()).resolves.toMatchObject({
      user: { id: adminUser.id, mfaEnabled: true },
    })
  })

  it('POST /auth/token rejects when no demo user can be resolved', async () => {
    await setDemoUsers([])

    const response = await jsonRequest('/auth/token', {
      method: 'POST',
      body: JSON.stringify({ code: 'unknown-code' }),
    })

    expect(response.status).toBe(401)
  })

  it('POST /auth/token resolves deterministic social codes', async () => {
    const response = await jsonRequest('/auth/token', {
      method: 'POST',
      body: JSON.stringify({ code: 'demo-oauth-code-google' }),
    })

    expect(response.status).toBe(200)
    const body = await parseJson<{ user: User }>(response)
    expect(body.user.id).toBe(adminUser.id)
    await expect(getDemoSession()).resolves.toMatchObject({ user: { id: adminUser.id } })
  })

  it('GET /api/auth/:provider redirects to the mock callback code', async () => {
    const response = await fetch(`${API_ORIGIN}/auth/github`, { redirect: 'manual' })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('/auth/callback')
    expect(response.headers.get('location')).toContain('code=demo-oauth-code-github')
  })
})

describe('users MSW handlers', () => {
  it('GET /users requires auth', async () => {
    const response = await fetch(`${API_ORIGIN}/users`)

    expect(response.status).toBe(401)
  })

  it('GET /users returns paginated, filtered users', async () => {
    const response = await fetch(`${API_ORIGIN}/users?page=1&pageSize=1&search=member`, {
      headers: AUTH_HEADER,
    })

    expect(response.status).toBe(200)
    await expect(
      parseJson<{ data: User[]; meta: { total: number; pageSize: number } }>(response),
    ).resolves.toMatchObject({
      data: [{ id: memberUser.id }],
      meta: { total: 1, pageSize: 1 },
    })
  })

  it('POST /users validates required fields and duplicate email', async () => {
    const invalid = await jsonRequest('/users', {
      method: 'POST',
      headers: AUTH_HEADER,
      body: JSON.stringify({ email: '' }),
    })
    expect(invalid.status).toBe(422)

    const duplicate = await jsonRequest('/users', {
      method: 'POST',
      headers: AUTH_HEADER,
      body: JSON.stringify({ email: adminUser.email, name: 'Duplicate', role: 'member' }),
    })
    expect(duplicate.status).toBe(409)
  })

  it('POST /users creates and persists a new user', async () => {
    const response = await jsonRequest('/users', {
      method: 'POST',
      headers: AUTH_HEADER,
      body: JSON.stringify({ email: 'new@example.test', name: 'New User', role: 'viewer' }),
    })

    expect(response.status).toBe(201)
    await expect(parseJson<User>(response)).resolves.toMatchObject({
      email: 'new@example.test',
      name: 'New User',
      role: 'viewer',
      emailVerified: false,
    })
    expect((await getDemoUsers()).some((user) => user.email === 'new@example.test')).toBe(true)
  })

  it('PATCH /users/:id/role updates roles and returns 404 for missing users', async () => {
    const missing = await jsonRequest('/users/missing/role', {
      method: 'PATCH',
      headers: AUTH_HEADER,
      body: JSON.stringify({ role: 'admin' }),
    })
    expect(missing.status).toBe(404)

    const response = await jsonRequest(`/users/${memberUser.id}/role`, {
      method: 'PATCH',
      headers: AUTH_HEADER,
      body: JSON.stringify({ role: 'manager' }),
    })
    expect(response.status).toBe(200)
    await expect(parseJson<User>(response)).resolves.toMatchObject({ role: 'manager' })
  })

  it('PATCH /users/:id/permissions updates explicit permissions and refreshes self session', async () => {
    await seedDemoSession(memberUser)
    const permissions: Permission[] = ['users:read', 'settings:read']

    const response = await jsonRequest(`/users/${memberUser.id}/permissions`, {
      method: 'PATCH',
      headers: AUTH_HEADER,
      body: JSON.stringify({ permissions }),
    })

    expect(response.status).toBe(200)
    await expect(parseJson<User>(response)).resolves.toMatchObject({ permissions })
    await expect(getDemoSession()).resolves.toMatchObject({ user: { permissions } })
  })
})
