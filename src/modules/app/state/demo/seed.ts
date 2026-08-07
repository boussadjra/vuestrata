import { getRegisteredPermissions } from '~/lib/rbac'
import type { Permission, User } from '~/types'

import { getDemoUsers, setDemoUsers } from '../demo-store'
import { DEMO_ACCOUNT } from './account'

/**
 * Seed the demo super-admin, once, if no demo users exist yet.
 *
 * This used to run unconditionally from `installRuntimeBackends()` — no dev
 * check, no adapter check — so every boot in every environment wrote a
 * super-admin holding every permission into IndexedDB, production included.
 * It now lives behind the demo boundary and is called from exactly one place:
 * the `__VUESTRATA_DEMO__` branch in main.ts.
 *
 * Permissions come from the live RBAC registry rather than a hardcoded list,
 * so a module that contributes new permissions does not silently leave the
 * demo admin unable to use its own features.
 */
export async function seedDemoSuperAdmin(): Promise<void> {
  const existing = await getDemoUsers()
  if (existing.length > 0) return

  const now = new Date().toISOString()
  const demoAdmin: User = {
    id: '1',
    email: DEMO_ACCOUNT.email,
    name: DEMO_ACCOUNT.name,
    role: 'super_admin',
    permissions: [...getRegisteredPermissions()] as Permission[],
    emailVerified: true,
    mfaEnabled: false,
    provider: 'credentials',
    createdAt: now,
    lastLoginAt: now,
  }

  await setDemoUsers([demoAdmin])
}
