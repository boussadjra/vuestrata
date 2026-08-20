import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vite-plus/test'

import { hasPermission } from '@/lib/rbac'
import { useModuleStore } from '@/modules'
import { appModules } from '@/modules/setup'
import type { ModuleNavItem } from '@/modules/types'
import { resolveRouteAccess, type GuardedRoute } from '@/plugins/route-guard'
import { getDemoUsers } from '@/state/demo-store'
import { DEMO_ACCOUNT } from '@/state/demo/account'
import { seedDemoSuperAdmin } from '@/state/demo/seed'
import { installRuntimeBackends, resetRuntimeBackends } from '@/state/runtime-backends'
import type { Permission, User } from '@/types'

import { resetDemoData, resetDemoGlobals } from '../../utils/auth-test-helpers'

/**
 * The demo account reaches everything the app ships.
 *
 * The promise the demo makes is that one sign-in shows the whole template: every
 * sidebar entry, every page, every module. Nothing enforces that structurally —
 * a permission lives in four places (the role deltas, the module's
 * `config.permissions`, the route meta, the nav item) and only the first of them
 * decides what the demo admin holds. A module that declares a permission no role
 * delta grants compiles, registers, routes, and then quietly disappears from the
 * sidebar for everyone including the super-admin.
 *
 * These tests boot the real module set the way `main.ts` does — register the
 * modules first so their permissions reach the RBAC registry, seed second — and
 * assert the outcome the demo is supposed to guarantee.
 */

function flattenNav(items: readonly ModuleNavItem[]): ModuleNavItem[] {
  return items.flatMap((item) => [item, ...flattenNav(item.children ?? [])])
}

async function bootDemoAdmin(): Promise<User> {
  setActivePinia(createPinia())
  installRuntimeBackends()

  // Mirrors main.ts: setupModules() registers every module — and with it every
  // module-contributed permission — before the demo seed runs.
  useModuleStore().registerModules(appModules)
  await seedDemoSuperAdmin()

  const admin = (await getDemoUsers()).find((user) => user.email === DEMO_ACCOUNT.email)
  if (!admin) throw new Error('The demo seed did not write the demo account')
  return admin
}

beforeEach(async () => {
  await resetDemoData()
  resetRuntimeBackends()
  resetDemoGlobals()
})

describe('demo account access', () => {
  it('holds every permission any module declares', async () => {
    const admin = await bootDemoAdmin()
    const held = new Set(admin.permissions ?? [])

    for (const mod of appModules) {
      for (const permission of mod.config.permissions ?? []) {
        expect(
          held.has(permission as Permission),
          `demo admin is missing "${permission}", declared by module "${mod.config.id}"`,
        ).toBe(true)
      }
    }
  })

  it('may open every route every module registers', async () => {
    const admin = await bootDemoAdmin()
    const subject = {
      isAuthenticated: true,
      role: admin.role,
      permissions: admin.permissions as Permission[],
    }

    for (const mod of appModules) {
      for (const route of mod.routes ?? []) {
        const meta = (route.meta ?? {}) as GuardedRoute['meta']
        const decision = resolveRouteAccess({ fullPath: route.path, meta }, subject)
        expect(
          decision.type,
          `demo admin is denied "${route.path}" (module "${mod.config.id}")`,
        ).toBe('allow')
      }
    }
  })

  it('sees every nav item the sidebar can render', async () => {
    const admin = await bootDemoAdmin()

    for (const mod of appModules) {
      for (const item of flattenNav(mod.navItems ?? [])) {
        if (!item.permission) continue
        expect(
          hasPermission(admin.role, admin.permissions as Permission[], item.permission),
          `demo admin cannot see nav item "${item.label}" (module "${mod.config.id}"), ` +
            `which requires "${item.permission}"`,
        ).toBe(true)
      }
    }
  })
})
