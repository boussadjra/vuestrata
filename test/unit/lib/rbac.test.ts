import { describe, it, expect, beforeEach } from 'vite-plus/test'

import {
  ROLE_DEFINITIONS,
  getRolePermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  isRoleAtLeast,
  registerPermissions,
  getRegisteredPermissions,
  isRegisteredPermission,
  clearRegistry,
  resolveRolePermissions,
  hasNamespacePermission,
  onAuthorizationCheck,
  clearHooks,
  registerPredicate,
  evaluatePredicate,
  clearPredicates,
} from '@/lib/rbac'
import type { AuthorizationEvent } from '@/lib/rbac/types'
import type { Role, Permission } from '@/types'

describe('RBAC - Role Definitions', () => {
  const allRoles: Role[] = ['super_admin', 'admin', 'manager', 'member', 'viewer', 'guest']

  it('should define all 6 roles', () => {
    expect(Object.keys(ROLE_DEFINITIONS)).toHaveLength(6)
    for (const role of allRoles) {
      expect(ROLE_DEFINITIONS[role]).toBeDefined()
      expect(ROLE_DEFINITIONS[role].name).toBe(role)
      expect(ROLE_DEFINITIONS[role].label).toBeTruthy()
      expect(ROLE_DEFINITIONS[role].description).toBeTruthy()
    }
  })

  // Asserted structurally rather than as a count. A hardcoded `16` here meant
  // that adding a domain permission failed this test for no reason other than
  // arithmetic, which teaches everyone to update the number without reading
  // what it was protecting. What actually matters is that the top of the
  // hierarchy holds everything every other role does.
  it('super_admin holds every permission any role grants', () => {
    const superAdmin = new Set<string>(ROLE_DEFINITIONS.super_admin.permissions)
    for (const role of allRoles) {
      for (const permission of ROLE_DEFINITIONS[role].permissions) {
        expect(superAdmin.has(permission), `super_admin is missing ${permission}`).toBe(true)
      }
    }
  })

  it('guest should have only dashboard:read', () => {
    expect(ROLE_DEFINITIONS.guest.permissions).toEqual(['dashboard:read'])
  })

  it('each role should have at least dashboard:read', () => {
    for (const role of allRoles) {
      expect(ROLE_DEFINITIONS[role].permissions).toContain('dashboard:read')
    }
  })

  it('higher roles should have more permissions than lower ones', () => {
    expect(ROLE_DEFINITIONS.super_admin.permissions.length).toBeGreaterThan(
      ROLE_DEFINITIONS.admin.permissions.length,
    )
    expect(ROLE_DEFINITIONS.admin.permissions.length).toBeGreaterThanOrEqual(
      ROLE_DEFINITIONS.manager.permissions.length,
    )
    expect(ROLE_DEFINITIONS.manager.permissions.length).toBeGreaterThan(
      ROLE_DEFINITIONS.member.permissions.length,
    )
    expect(ROLE_DEFINITIONS.member.permissions.length).toBeGreaterThan(
      ROLE_DEFINITIONS.viewer.permissions.length,
    )
    expect(ROLE_DEFINITIONS.viewer.permissions.length).toBeGreaterThan(
      ROLE_DEFINITIONS.guest.permissions.length,
    )
  })
})

describe('RBAC - getRolePermissions', () => {
  it('should return correct permissions for each role', () => {
    expect(getRolePermissions('super_admin')).toEqual(ROLE_DEFINITIONS.super_admin.permissions)
    expect(getRolePermissions('guest')).toEqual(['dashboard:read'])
  })
})

describe('RBAC - hasPermission', () => {
  it('should return true when role has the permission', () => {
    expect(hasPermission('admin', undefined, 'users:read')).toBe(true)
    expect(hasPermission('admin', undefined, 'billing:manage')).toBe(true)
  })

  it('should return false when role lacks the permission', () => {
    expect(hasPermission('guest', undefined, 'users:read')).toBe(false)
    expect(hasPermission('viewer', undefined, 'users:update')).toBe(false)
  })

  it('should use explicit permissions when provided', () => {
    const custom: Permission[] = ['users:read', 'dashboard:read']
    expect(hasPermission('guest', custom, 'users:read')).toBe(true)
    expect(hasPermission('super_admin', custom, 'billing:manage')).toBe(false)
  })
})

describe('RBAC - hasAnyPermission', () => {
  it('should return true if user has at least one required permission', () => {
    expect(hasAnyPermission('member', undefined, ['users:read', 'billing:manage'])).toBe(true)
  })

  it('should return false if user has none of the required permissions', () => {
    expect(hasAnyPermission('guest', undefined, ['users:read', 'billing:manage'])).toBe(false)
  })
})

describe('RBAC - hasAllPermissions', () => {
  it('should return true if user has all required permissions', () => {
    expect(hasAllPermissions('admin', undefined, ['users:read', 'billing:manage'])).toBe(true)
  })

  it('should return false if user lacks any required permission', () => {
    expect(hasAllPermissions('member', undefined, ['users:read', 'billing:manage'])).toBe(false)
  })
})

describe('RBAC - isRoleAtLeast', () => {
  it('super_admin is at least any role', () => {
    expect(isRoleAtLeast('super_admin', 'super_admin')).toBe(true)
    expect(isRoleAtLeast('super_admin', 'guest')).toBe(true)
  })

  it('guest is only at least guest', () => {
    expect(isRoleAtLeast('guest', 'guest')).toBe(true)
    expect(isRoleAtLeast('guest', 'viewer')).toBe(false)
    expect(isRoleAtLeast('guest', 'admin')).toBe(false)
  })

  it('member is at least viewer and guest, but not manager', () => {
    expect(isRoleAtLeast('member', 'viewer')).toBe(true)
    expect(isRoleAtLeast('member', 'guest')).toBe(true)
    expect(isRoleAtLeast('member', 'member')).toBe(true)
    expect(isRoleAtLeast('member', 'manager')).toBe(false)
  })

  it('role hierarchy is strictly ordered', () => {
    const roles: Role[] = ['super_admin', 'admin', 'manager', 'member', 'viewer', 'guest']
    for (let i = 0; i < roles.length; i++) {
      for (let j = i; j < roles.length; j++) {
        expect(isRoleAtLeast(roles[i]!, roles[j]!)).toBe(true)
      }
      for (let j = 0; j < i; j++) {
        expect(isRoleAtLeast(roles[i]!, roles[j]!)).toBe(false)
      }
    }
  })
})

// ─── Permission Registry (US1) ───────────────────────────

describe('RBAC - Permission Registry', () => {
  beforeEach(() => {
    clearRegistry()
  })

  it('seeds every permission the role hierarchy can grant', () => {
    const registered = getRegisteredPermissions()
    for (const permission of resolveRolePermissions('super_admin')) {
      expect(registered.has(permission), `${permission} was not seeded`).toBe(true)
    }
    expect(isRegisteredPermission('users:read')).toBe(true)
    expect(isRegisteredPermission('audit:read')).toBe(true)
  })

  it('should register module permissions with namespace prefix', () => {
    const before = getRegisteredPermissions().size
    registerPermissions('inventory', ['read', 'write'])
    expect(isRegisteredPermission('inventory:read')).toBe(true)
    expect(isRegisteredPermission('inventory:write')).toBe(true)
    expect(getRegisteredPermissions().size).toBe(before + 2)
  })

  it('should keep fully-qualified module permissions as-is', () => {
    registerPermissions('billing', ['billing:read', 'billing:manage'])
    expect(isRegisteredPermission('billing:read')).toBe(true)
    expect(isRegisteredPermission('billing:manage')).toBe(true)
    expect(isRegisteredPermission('billing:billing:read')).toBe(false)
  })

  it('should be idempotent — duplicate registration is a no-op', () => {
    registerPermissions('catalog', ['read'])
    const sizeBefore = getRegisteredPermissions().size
    registerPermissions('catalog', ['read'])
    expect(getRegisteredPermissions().size).toBe(sizeBefore)
  })

  it('isRegisteredPermission returns false for unknown permissions', () => {
    expect(isRegisteredPermission('unknown:action')).toBe(false)
  })
})

// ─── Role Inheritance (US2) ──────────────────────────────

describe('RBAC - Role Inheritance', () => {
  const allRoles: Role[] = ['super_admin', 'admin', 'manager', 'member', 'viewer', 'guest']

  it('guest should have only dashboard:read', () => {
    const perms = resolveRolePermissions('guest')
    expect(perms).toContain('dashboard:read')
    expect(perms).toHaveLength(1)
  })

  it('viewer inherits everything guest has and adds read access', () => {
    const perms = resolveRolePermissions('viewer')
    for (const permission of resolveRolePermissions('guest')) {
      expect(perms).toContain(permission)
    }
    expect(perms).toContain('reports:read')
    // A viewer must never gain a write capability, whatever modules are added.
    expect(perms.filter((permission) => permission.endsWith(':manage'))).toEqual([])
  })

  it('permissions accumulate monotonically up the hierarchy', () => {
    // The property the delta model is supposed to guarantee, and the one that
    // breaks silently if a delta is added to the wrong role.
    const ordered: Role[] = ['guest', 'viewer', 'member', 'manager', 'admin', 'super_admin']
    for (let index = 1; index < ordered.length; index += 1) {
      const lower = new Set(resolveRolePermissions(ordered[index - 1]!))
      const higher = new Set(resolveRolePermissions(ordered[index]!))
      for (const permission of lower) {
        expect(higher.has(permission), `${ordered[index]} lost ${permission}`).toBe(true)
      }
    }
  })

  it('resolved permissions match ROLE_DEFINITIONS for all roles', () => {
    for (const role of allRoles) {
      const resolved = new Set(resolveRolePermissions(role))
      const legacy = new Set(ROLE_DEFINITIONS[role].permissions)
      expect(resolved).toEqual(legacy)
    }
  })

  it('higher roles always have a superset of lower role permissions', () => {
    for (let i = 0; i < allRoles.length - 1; i++) {
      const higher = new Set(resolveRolePermissions(allRoles[i]!))
      const lower = new Set(resolveRolePermissions(allRoles[i + 1]!))
      for (const perm of lower) {
        expect(higher.has(perm)).toBe(true)
      }
    }
  })
})

// ─── Namespace Checks (US5) ──────────────────────────────

describe('RBAC - Namespace Permission', () => {
  it('returns true when user has permissions in the namespace', () => {
    expect(hasNamespacePermission('admin', undefined, 'billing')).toBe(true)
    expect(hasNamespacePermission('admin', undefined, 'users')).toBe(true)
  })

  it('returns false when user has no permissions in the namespace', () => {
    expect(hasNamespacePermission('guest', undefined, 'billing')).toBe(false)
    expect(hasNamespacePermission('guest', undefined, 'users')).toBe(false)
  })

  it('returns false for a namespace with no registered permissions', () => {
    expect(hasNamespacePermission('super_admin', undefined, 'nonexistent')).toBe(false)
  })

  it('uses explicit permissions when provided', () => {
    expect(hasNamespacePermission('guest', ['billing:read'] as Permission[], 'billing')).toBe(true)
  })
})

// ─── Authorization Hooks (US6) ───────────────────────────

describe('RBAC - Authorization Hooks', () => {
  beforeEach(() => {
    clearHooks()
    clearPredicates()
  })

  it('should fire hook on hasPermission call', () => {
    const events: AuthorizationEvent[] = []
    onAuthorizationCheck((e) => events.push(e))
    hasPermission('admin', undefined, 'users:read')
    expect(events).toHaveLength(1)
    expect(events[0]!.permission).toBe('users:read')
    expect(events[0]!.granted).toBe(true)
    expect(events[0]!.userRole).toBe('admin')
  })

  it('should support multiple subscribers', () => {
    let count1 = 0
    let count2 = 0
    onAuthorizationCheck(() => {
      count1++
    })
    onAuthorizationCheck(() => {
      count2++
    })
    hasPermission('admin', undefined, 'users:read')
    expect(count1).toBe(1)
    expect(count2).toBe(1)
  })

  it('should support unsubscribe', () => {
    let count = 0
    const unsub = onAuthorizationCheck(() => {
      count++
    })
    hasPermission('admin', undefined, 'users:read')
    expect(count).toBe(1)
    unsub()
    hasPermission('admin', undefined, 'users:read')
    expect(count).toBe(1)
  })

  it('should isolate errors — throwing hook does not affect others', () => {
    const events: AuthorizationEvent[] = []
    onAuthorizationCheck(() => {
      throw new Error('boom')
    })
    onAuthorizationCheck((e) => events.push(e))
    hasPermission('admin', undefined, 'users:read')
    expect(events).toHaveLength(1)
  })
})

// ─── Predicates (US7) ────────────────────────────────────

describe('RBAC - Permission Predicates', () => {
  beforeEach(() => {
    clearPredicates()
    clearHooks()
  })

  it('evaluatePredicate returns null when no predicate is registered', () => {
    expect(evaluatePredicate('users:update', { ownerId: '1' })).toBeNull()
  })

  it('evaluatePredicate returns null when no context is provided', () => {
    registerPredicate('users:update', (ctx) => ctx.ownerId === ctx.userId)
    expect(evaluatePredicate('users:update', undefined)).toBeNull()
  })

  it('evaluatePredicate returns boolean when predicate and context exist', () => {
    registerPredicate('users:update', (ctx) => ctx.ownerId === ctx.userId)
    expect(evaluatePredicate('users:update', { ownerId: '1', userId: '1' })).toBe(true)
    expect(evaluatePredicate('users:update', { ownerId: '1', userId: '2' })).toBe(false)
  })

  it('hasPermission uses predicate when context is provided', () => {
    registerPredicate('users:update', (ctx) => ctx.ownerId === ctx.userId)
    // Guest doesn't have users:update by role, but predicate grants it
    expect(
      hasPermission('guest', undefined, 'users:update', {
        ownerId: '1',
        userId: '1',
      }),
    ).toBe(true)
    expect(
      hasPermission('guest', undefined, 'users:update', {
        ownerId: '1',
        userId: '2',
      }),
    ).toBe(false)
  })

  it('hasPermission falls back to role-based check when no predicate', () => {
    expect(hasPermission('admin', undefined, 'users:update')).toBe(true)
    expect(hasPermission('guest', undefined, 'users:update')).toBe(false)
  })
})
