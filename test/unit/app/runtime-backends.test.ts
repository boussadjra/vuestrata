import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { getRegisteredPermissions, registerPermissions } from '@/lib/rbac'
import { getDemoUsers, setDemoUsers } from '@/state/demo-store'
import {
  BUILTIN_PERMISSIONS,
  installRuntimeBackends,
  resetRuntimeBackends,
} from '@/state/runtime-backends'

import { createAuthTestUser, resetDemoData, resetDemoGlobals } from '../../utils/auth-test-helpers'

beforeEach(async () => {
  await resetDemoData()
  resetRuntimeBackends()
})

afterEach(() => {
  resetDemoGlobals()
})

describe('runtime-backends — permissions', () => {
  it('exports the 16 built-in permissions', () => {
    expect(BUILTIN_PERMISSIONS).toHaveLength(16)
    expect(BUILTIN_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'users:read',
        'users:create',
        'users:update',
        'users:delete',
        'roles:read',
        'roles:assign',
        'dashboard:read',
        'audit:read',
      ]),
    )
  })

  it('resets registered permissions back to built-ins', () => {
    registerPermissions('custom', ['read'])
    expect(getRegisteredPermissions().has('custom:read')).toBe(true)

    resetRuntimeBackends()

    expect(getRegisteredPermissions().has('custom:read')).toBe(false)
    expect([...getRegisteredPermissions()]).toEqual(expect.arrayContaining(BUILTIN_PERMISSIONS))
  })
})

describe('runtime-backends — demo super admin seed', () => {
  it('seeds the default super_admin when the demo users store is empty', async () => {
    await installRuntimeBackends()

    const users = await getDemoUsers()
    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({
      id: '1',
      email: 'demo@vuestrata.dev',
      name: 'Demo Admin',
      role: 'super_admin',
      emailVerified: true,
      mfaEnabled: false,
      provider: 'credentials',
    })
    expect(users[0]?.permissions).toEqual(expect.arrayContaining(BUILTIN_PERMISSIONS))
    expect(users[0]?.permissions).toHaveLength(BUILTIN_PERMISSIONS.length)
  })

  it('does not overwrite an existing users list', async () => {
    const existing = createAuthTestUser({ id: 'existing', email: 'existing@example.test' })
    await setDemoUsers([existing])

    await installRuntimeBackends()

    await expect(getDemoUsers()).resolves.toEqual([existing])
  })

  it('is idempotent across repeated installs', async () => {
    await installRuntimeBackends()
    await installRuntimeBackends()

    const users = await getDemoUsers()
    expect(users.map((user) => user.email)).toEqual(['demo@vuestrata.dev'])
  })
})
