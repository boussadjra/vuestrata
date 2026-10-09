import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { createApp } from 'vue'

import { useRbac } from '@/composables/useRbac'
import { resolveRouteAccess, type GuardedRoute } from '@/plugins/route-guard'
import { useAuthStore } from '@/stores/auth'
import { parseUser } from '~/lib/auth/user'
import {
  ROLE_DEFINITIONS,
  ROLE_HIERARCHY,
  getRolePermissions,
  hasPermission,
  isRoleAtLeast,
  resolveRolePermissions,
  resolveSubjectPermissions,
} from '~/lib/rbac'
import { resolveRbacOverrides } from '~/lib/rbac/overrides'
import { installRbacConfig } from '~/lib/runtime'
import type { Permission, Role, User } from '~/types'

/**
 * What a project with one role per user, and nothing in `rbac.overrides.ts`,
 * gets today. Written before roles became declarable and users could hold more
 * than one, and not to be edited afterwards: it is the proof that neither
 * changed anything for a project that uses neither.
 *
 * The values are literal on purpose. Asserting them through the functions under
 * test (`expect(x).toEqual(resolveRolePermissions(...))`) would pass for any
 * behaviour at all.
 *
 * Every test installs the seam as shipped, empty, so the assertions hold in a
 * project that has since granted or withdrawn something of its own.
 */

const BUILTIN = ['super_admin', 'admin', 'manager', 'member', 'viewer', 'guest'] as const

beforeEach(() => {
  setActivePinia(createPinia())
  installRbacConfig(resolveRbacOverrides({}))
})

function user(overrides: Partial<User> = {}): User {
  return { id: 'u-1', email: 'u1@example.test', name: 'User One', role: 'member', ...overrides }
}

/** The subject exactly as `plugins/router.ts` builds it for the guard. */
function guardSubject() {
  const auth = useAuthStore()
  return {
    isAuthenticated: auth.isAuthenticated,
    role: auth.userRole,
    permissions: auth.userPermissions as Permission[] | undefined,
  }
}

const roleRoute = (requiredRole: Role): GuardedRoute => ({
  fullPath: `/needs/${requiredRole}`,
  meta: { requiredRole },
})

describe('the built-in roles, with nothing declared', () => {
  it('are these six, in this order', () => {
    expect(ROLE_HIERARCHY).toMatchInlineSnapshot(`
      [
        "super_admin",
        "admin",
        "manager",
        "member",
        "viewer",
        "guest",
      ]
    `)
    expect(Object.keys(ROLE_DEFINITIONS)).toMatchInlineSnapshot(`
      [
        "super_admin",
        "admin",
        "manager",
        "member",
        "viewer",
        "guest",
      ]
    `)
  })

  it('are labelled and described like this', () => {
    expect(
      Object.values(ROLE_DEFINITIONS).map(({ name, label, description }) => ({
        name,
        label,
        description,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "description": "Full system access with no restrictions",
          "label": "Super Admin",
          "name": "super_admin",
        },
        {
          "description": "Organization admin with broad access",
          "label": "Admin",
          "name": "admin",
        },
        {
          "description": "Team manager with reporting and user management",
          "label": "Manager",
          "name": "manager",
        },
        {
          "description": "Standard team member",
          "label": "Member",
          "name": "member",
        },
        {
          "description": "Read-only access to dashboards and reports",
          "label": "Viewer",
          "name": "viewer",
        },
        {
          "description": "Limited access for external collaborators",
          "label": "Guest",
          "name": "guest",
        },
      ]
    `)
  })

  it('hold exactly these permissions, in this order', () => {
    expect(Object.fromEntries(BUILTIN.map((role) => [role, resolveRolePermissions(role)])))
      .toMatchInlineSnapshot(`
      {
        "admin": [
          "dashboard:read",
          "reports:read",
          "customers:read",
          "orders:read",
          "catalog:read",
          "projects:read",
          "calendar:read",
          "team:read",
          "users:read",
          "settings:read",
          "messages:read",
          "calendar:manage",
          "users:create",
          "users:update",
          "roles:read",
          "billing:read",
          "dashboard:export",
          "reports:create",
          "reports:export",
          "customers:manage",
          "orders:manage",
          "catalog:manage",
          "projects:manage",
          "roles:assign",
          "billing:manage",
          "settings:update",
          "audit:read",
        ],
        "guest": [
          "dashboard:read",
        ],
        "manager": [
          "dashboard:read",
          "reports:read",
          "customers:read",
          "orders:read",
          "catalog:read",
          "projects:read",
          "calendar:read",
          "team:read",
          "users:read",
          "settings:read",
          "messages:read",
          "calendar:manage",
          "users:create",
          "users:update",
          "roles:read",
          "billing:read",
          "dashboard:export",
          "reports:create",
          "reports:export",
          "customers:manage",
          "orders:manage",
          "catalog:manage",
          "projects:manage",
        ],
        "member": [
          "dashboard:read",
          "reports:read",
          "customers:read",
          "orders:read",
          "catalog:read",
          "projects:read",
          "calendar:read",
          "team:read",
          "users:read",
          "settings:read",
          "messages:read",
          "calendar:manage",
        ],
        "super_admin": [
          "dashboard:read",
          "reports:read",
          "customers:read",
          "orders:read",
          "catalog:read",
          "projects:read",
          "calendar:read",
          "team:read",
          "users:read",
          "settings:read",
          "messages:read",
          "calendar:manage",
          "users:create",
          "users:update",
          "roles:read",
          "billing:read",
          "dashboard:export",
          "reports:create",
          "reports:export",
          "customers:manage",
          "orders:manage",
          "catalog:manage",
          "projects:manage",
          "roles:assign",
          "billing:manage",
          "settings:update",
          "audit:read",
          "users:delete",
        ],
        "viewer": [
          "dashboard:read",
          "reports:read",
          "customers:read",
          "orders:read",
          "catalog:read",
          "projects:read",
          "calendar:read",
          "team:read",
        ],
      }
    `)
  })

  it('resolve the same through every reader', () => {
    for (const role of BUILTIN) {
      const held = resolveRolePermissions(role)
      expect(getRolePermissions(role)).toEqual(held)
      expect(ROLE_DEFINITIONS[role].permissions).toEqual(held)
      expect(resolveRolePermissions(role, null)).toEqual(held)
      expect(resolveSubjectPermissions({ role })).toEqual(held)
    }
  })

  it('are ordered like this: which role is at least which', () => {
    const atLeast = Object.fromEntries(
      BUILTIN.map((held) => [
        held,
        BUILTIN.filter((required) => isRoleAtLeast(held, required)).join(' '),
      ]),
    )
    expect(atLeast).toMatchInlineSnapshot(`
      {
        "admin": "admin manager member viewer guest",
        "guest": "guest",
        "manager": "manager member viewer guest",
        "member": "member viewer guest",
        "super_admin": "super_admin admin manager member viewer guest",
        "viewer": "viewer guest",
      }
    `)
  })

  it('know no other role: one holds nothing and is at least nothing', () => {
    const unknown = 'mystery' as Role

    expect(resolveRolePermissions(unknown)).toEqual([])
    expect(resolveSubjectPermissions({ role: unknown })).toEqual([])
    for (const role of BUILTIN) {
      expect(isRoleAtLeast(unknown, role)).toBe(false)
      expect(isRoleAtLeast(role, unknown)).toBe(false)
    }
    expect(isRoleAtLeast(unknown, unknown)).toBe(false)
    expect(hasPermission(unknown, undefined, 'dashboard:read')).toBe(false)
  })

  it('resolve to an empty configuration', () => {
    expect(resolveRbacOverrides({})).toEqual({ grants: {}, withdrawn: [] })
    expect(resolveRbacOverrides()).toEqual({ grants: {}, withdrawn: [] })
  })
})

describe('a user with one role', () => {
  it('enters the app as the backend sent it, with no field added', () => {
    expect(parseUser({ id: 7, email: 'a@example.test', role: 'manager', tenantId: 't-1' }))
      .toMatchInlineSnapshot(`
      {
        "email": "a@example.test",
        "id": "7",
        "name": "a@example.test",
        "role": "manager",
        "tenantId": "t-1",
      }
    `)
    expect(
      parseUser({
        id: 'u-2',
        email: 'b@example.test',
        name: 'B',
        role: 'viewer',
        permissions: ['users:read', 'not-a-permission:here'],
      }),
    ).toMatchInlineSnapshot(`
      {
        "email": "b@example.test",
        "id": "u-2",
        "name": "B",
        "permissions": [
          "users:read",
          "not-a-permission:here",
        ],
        "role": "viewer",
      }
    `)
    // No role: none is invented.
    expect(parseUser({ id: 'u-3', email: 'c@example.test' })).toMatchInlineSnapshot(`
      {
        "email": "c@example.test",
        "id": "u-3",
        "name": "c@example.test",
      }
    `)
    // A role the app does not know is kept as the backend named it.
    expect(parseUser({ id: 'u-4', email: 'd@example.test', role: 'mystery' }))
      .toMatchInlineSnapshot(`
      {
        "email": "d@example.test",
        "id": "u-4",
        "name": "d@example.test",
        "role": "mystery",
      }
    `)
  })

  it('is held by the store unchanged, and reads as that role', () => {
    const auth = useAuthStore()
    const manager = user({ role: 'manager' })

    auth.setAuth(manager, 'access-token')

    expect(auth.user).toEqual({
      id: 'u-1',
      email: 'u1@example.test',
      name: 'User One',
      role: 'manager',
    })
    expect(auth.userRole).toBe('manager')
    expect(auth.userPermissions).toMatchInlineSnapshot(`
      [
        "dashboard:read",
        "reports:read",
        "customers:read",
        "orders:read",
        "catalog:read",
        "projects:read",
        "calendar:read",
        "team:read",
        "users:read",
        "settings:read",
        "messages:read",
        "calendar:manage",
        "users:create",
        "users:update",
        "roles:read",
        "billing:read",
        "dashboard:export",
        "reports:create",
        "reports:export",
        "customers:manage",
        "orders:manage",
        "catalog:manage",
        "projects:manage",
      ]
    `)
  })

  it('holds its explicit permissions and nothing the role adds', () => {
    const auth = useAuthStore()

    auth.setAuth(user({ role: 'admin', permissions: ['users:read'] }), 'access-token')
    expect(auth.userPermissions).toEqual(['users:read'])

    auth.setAuth(user({ role: 'admin', permissions: [] }), 'access-token')
    expect(auth.userPermissions).toEqual([])

    // A permission string the app does not declare stays in the list as sent.
    auth.setAuth(
      user({ role: 'guest', permissions: ['users:read', 'made-up:thing' as Permission] }),
      'access-token',
    )
    expect(auth.userPermissions).toEqual(['users:read', 'made-up:thing'])
  })

  it('reads as guest, holding nothing, without a role or without a user', () => {
    const auth = useAuthStore()

    expect(auth.userRole).toBe('guest')
    expect(auth.userPermissions).toEqual([])

    auth.setAuth(user({ role: undefined as unknown as Role }), 'access-token')
    expect(auth.userRole).toBe('guest')
    expect(auth.userPermissions).toEqual([])
  })

  it('keeps a role the app does not know as its role, holding nothing', () => {
    const auth = useAuthStore()

    auth.setAuth(user({ role: 'mystery' as Role }), 'access-token')

    expect(auth.userRole).toBe('mystery')
    expect(auth.userPermissions).toEqual([])
  })

  it('gets these answers from useRbac', () => {
    useAuthStore().setAuth(user({ role: 'manager' }), 'access-token')
    const app = createApp({ render: () => null })
    const rbac = app.runWithContext(() => useRbac())

    expect(rbac.role.value).toBe('manager')
    expect(rbac.permissions.value).toEqual(resolveRolePermissions('manager'))
    expect(rbac.can('customers:manage')).toBe(true)
    expect(rbac.can('users:delete')).toBe(false)
    expect(rbac.canAny(['users:delete', 'billing:read'])).toBe(true)
    expect(rbac.canAll(['users:delete', 'billing:read'])).toBe(false)
    expect(rbac.canNamespace('billing')).toBe(true)
    expect(rbac.canNamespace('audit')).toBe(false)
    expect(BUILTIN.filter((role) => rbac.isAtLeast(role))).toEqual([
      'manager',
      'member',
      'viewer',
      'guest',
    ])
  })

  it('gets these answers from useRbac when nobody is signed in', () => {
    const app = createApp({ render: () => null })
    const rbac = app.runWithContext(() => useRbac())

    expect(rbac.role.value).toBe('guest')
    expect(rbac.permissions.value).toEqual([])
    expect(rbac.can('dashboard:read')).toBe(false)
    expect(BUILTIN.filter((role) => rbac.isAtLeast(role))).toEqual(['guest'])
  })

  it('passes the route guard for the roles at or below its own', () => {
    const auth = useAuthStore()
    const opened = (): string =>
      BUILTIN.filter(
        (required) => resolveRouteAccess(roleRoute(required), guardSubject()).type === 'allow',
      ).join(' ')

    const byRole: Record<string, string> = {}
    for (const role of BUILTIN) {
      auth.setAuth(user({ role }), 'access-token')
      byRole[role] = opened()
    }
    expect(byRole).toMatchInlineSnapshot(`
      {
        "admin": "admin manager member viewer guest",
        "guest": "guest",
        "manager": "manager member viewer guest",
        "member": "member viewer guest",
        "super_admin": "super_admin admin manager member viewer guest",
        "viewer": "viewer guest",
      }
    `)

    auth.setAuth(user({ role: 'mystery' as Role }), 'access-token')
    expect(opened()).toBe('')

    // Not signed in: judged as a guest, by role.
    auth.clearAuth()
    expect(opened()).toBe('guest')
  })

  it('passes the guard on a permission its role grants, and on no other', () => {
    useAuthStore().setAuth(user({ role: 'viewer' }), 'access-token')

    const decide = (requiredPermission: Permission) =>
      resolveRouteAccess({ fullPath: '/p', meta: { requiredPermission } }, guardSubject()).type

    expect(decide('customers:read')).toBe('allow')
    expect(decide('customers:manage')).toBe('forbidden')
  })
})
