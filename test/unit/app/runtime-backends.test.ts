import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import { getRegisteredPermissions, registerPermissions } from '@/lib/rbac'
import { getDemoUsers, setDemoUsers } from '@/state/demo-store'
import { DEMO_ACCOUNT } from '@/state/demo/account'
import { seedDemoSuperAdmin } from '@/state/demo/seed'
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
  it('exports every permission the role hierarchy can grant', () => {
    // Derived from `resolveRolePermissions('super_admin')`, so the assertion is
    // that nothing is *missing* — a count would only ever assert arithmetic.
    expect(BUILTIN_PERMISSIONS.length).toBeGreaterThan(0)
    expect(new Set(BUILTIN_PERMISSIONS).size).toBe(BUILTIN_PERMISSIONS.length)
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

describe('runtime-backends — demo isolation', () => {
  /**
   * Regression test for the most serious defect this refactor fixed.
   *
   * `installRuntimeBackends()` used to end with an unconditional
   * `await seedDemoSuperAdmin()`. There was no dev check and no adapter check,
   * so every boot in every environment — a real production deployment against a
   * real backend included — wrote a `super_admin` holding every registered
   * permission into the browser's IndexedDB.
   *
   * Wiring runtime backends must have nothing to do with demo data.
   */
  it('does not write any demo data', async () => {
    installRuntimeBackends()

    await expect(getDemoUsers()).resolves.toEqual([])
  })
})

describe('demo super admin seed', () => {
  it('seeds the default super_admin when the demo users store is empty', async () => {
    await seedDemoSuperAdmin()

    const users = await getDemoUsers()
    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({
      id: '1',
      email: DEMO_ACCOUNT.email,
      name: DEMO_ACCOUNT.name,
      role: 'super_admin',
      emailVerified: true,
      mfaEnabled: false,
      provider: 'credentials',
    })
    expect(users[0]?.permissions).toEqual(expect.arrayContaining(BUILTIN_PERMISSIONS))
    expect(users[0]?.permissions).toHaveLength(BUILTIN_PERMISSIONS.length)
  })

  it('grants module-contributed permissions, not just the built-ins', async () => {
    // Permissions come from the live registry rather than a hardcoded list, so
    // a module that adds its own does not leave the demo admin unable to use
    // the feature it just registered.
    registerPermissions('reporting', ['publish'])

    await seedDemoSuperAdmin()

    const [seeded] = await getDemoUsers()
    expect(seeded?.permissions).toContain('reporting:publish')
  })

  it('does not overwrite an existing users list', async () => {
    const existing = createAuthTestUser({ id: 'existing', email: 'existing@example.test' })
    await setDemoUsers([existing])

    await seedDemoSuperAdmin()

    await expect(getDemoUsers()).resolves.toEqual([existing])
  })

  it('is idempotent across repeated calls', async () => {
    await seedDemoSuperAdmin()
    await seedDemoSuperAdmin()

    const users = await getDemoUsers()
    expect(users.map((user) => user.email)).toEqual([DEMO_ACCOUNT.email])
  })
})
