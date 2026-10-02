import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useModuleNav } from '@/composables/useModuleNav'
import { useRbac } from '@/composables/useRbac'
import { resolveRouteAccess } from '@/plugins/route-guard'
import { useAuthStore } from '@/stores/auth'
import { ROLE_HIERARCHY, resolveRolePermissions, resolveSubjectPermissions } from '~/lib/rbac'
import { useModuleStore } from '~/modules'
import type { ModuleDefinition } from '~/modules/types'
import type { Permission, Role, User } from '~/types'

import { createUser } from '../../fixtures'

/**
 * The route guard, `useRbac` and the sidebar must give one answer.
 *
 * They used to answer separately. The store handed the guard
 * `user.permissions ?? []`, which is never undefined, so the guard never fell
 * back to the role; `useRbac` and the sidebar did. A backend that described a
 * user by role alone therefore got a sidebar full of links that all ended at
 * /403. Each row below is a user shape, asserted against all three surfaces
 * for every permission the template knows.
 */

const PROBES: Permission[] = [...new Set(ROLE_HIERARCHY.flatMap((r) => resolveRolePermissions(r)))]

function navModule(): ModuleDefinition {
  return {
    config: {
      id: 'parity',
      name: 'parity',
      description: '',
      version: '1.0.0',
      category: 'content',
    },
    navItems: PROBES.map((permission) => ({
      label: permission,
      icon: 'file',
      to: `/${permission}`,
      permission,
      group: 'overview',
    })),
  }
}

interface Surfaces {
  guard: Set<string>
  rbac: Set<string>
  nav: Set<string>
}

/** What each surface grants for the user currently in the store. */
async function surfaces(): Promise<Surfaces> {
  const auth = useAuthStore()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: {} }],
  })
  const app = createApp({ render: () => null })
  app.use(router)

  const moduleStore = useModuleStore()
  moduleStore.registerModule(navModule())
  await moduleStore.enableModule('parity')

  const { can } = app.runWithContext(() => useRbac())
  const { groups } = app.runWithContext(() => useModuleNav())

  // The same subject `plugins/router.ts` hands the guard.
  const subject = {
    isAuthenticated: auth.isAuthenticated,
    role: auth.userRole,
    permissions: auth.userPermissions,
  }

  return {
    // No `requiresAuth`, so a signed-out visitor is judged on permissions too.
    guard: new Set(
      PROBES.filter(
        (permission) =>
          resolveRouteAccess(
            { fullPath: `/${permission}`, meta: { requiredPermission: permission } },
            subject,
          ).type === 'allow',
      ),
    ),
    rbac: new Set(PROBES.filter((permission) => can(permission))),
    nav: new Set(groups.value.flatMap((group) => group.items.map((item) => item.label))),
  }
}

function signIn(overrides: Partial<User>) {
  useAuthStore().setAuth(createUser(overrides), 'access-token')
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('guard, useRbac and sidebar agree', () => {
  const rows: Array<{ name: string; user: Partial<User> | null; expected: readonly Permission[] }> =
    [
      {
        name: 'a role and no permissions (role-only /auth/me)',
        user: { role: 'manager' },
        expected: resolveRolePermissions('manager'),
      },
      {
        name: 'permissions and a role that grants nothing extra',
        user: { role: 'guest', permissions: ['billing:read', 'users:read'] },
        expected: ['billing:read', 'users:read'],
      },
      {
        name: 'both: the explicit set narrows the role, it does not add to it',
        user: { role: 'admin', permissions: ['users:read'] },
        expected: ['users:read'],
      },
      {
        name: 'an explicitly empty permission set',
        user: { role: 'admin', permissions: [] },
        expected: [],
      },
      {
        name: 'a role the hierarchy does not know, with no permissions',
        user: { role: 'mystery' as Role },
        expected: [],
      },
      { name: 'nobody signed in', user: null, expected: [] },
      ...ROLE_HIERARCHY.map((role) => ({
        name: `the built-in role ${role}`,
        user: { role },
        expected: resolveRolePermissions(role),
      })),
    ]

  it.each(rows)('$name', async ({ user, expected }) => {
    if (user) signIn(user)

    const { guard, rbac, nav } = await surfaces()
    const want = new Set<string>(expected)

    expect([...guard].sort()).toEqual([...want].sort())
    expect([...rbac].sort()).toEqual([...want].sort())
    expect([...nav].sort()).toEqual([...want].sort())
  })

  it('resolves through one function', () => {
    const user = createUser({ role: 'viewer' })

    expect(resolveSubjectPermissions(user)).toEqual(resolveRolePermissions('viewer'))
    expect(useAuthStore().userPermissions).toEqual([])
    useAuthStore().setAuth(user, 'access-token')
    expect(useAuthStore().userPermissions).toEqual(resolveSubjectPermissions(user))
  })
})

describe('resolveSubjectPermissions', () => {
  it('holds nothing for nobody', () => {
    expect(resolveSubjectPermissions(null)).toEqual([])
    expect(resolveSubjectPermissions(undefined)).toEqual([])
  })

  it('returns a copy of an explicit set, so a caller cannot edit the user through it', () => {
    const user = createUser({ role: 'member', permissions: ['users:read'] })

    const resolved = resolveSubjectPermissions(user)
    resolved.push('users:delete')

    expect(user.permissions).toEqual(['users:read'])
  })

  it('lets an explicit empty set win over the role', () => {
    expect(resolveSubjectPermissions({ role: 'super_admin', permissions: [] })).toEqual([])
  })

  it('derives from the role only when no set was given', () => {
    expect(resolveSubjectPermissions({ role: 'viewer' })).toEqual(resolveRolePermissions('viewer'))
    expect(resolveSubjectPermissions({ role: 'viewer', permissions: null })).toEqual(
      resolveRolePermissions('viewer'),
    )
    expect(resolveSubjectPermissions({ permissions: undefined })).toEqual([])
  })
})
