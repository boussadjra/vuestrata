import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  isRoleAtLeast,
  hasNamespacePermission,
} from '~/lib/rbac'
import {
  anyRoleAtLeast,
  resolvePrimaryRole,
  resolveSubjectPermissions,
  resolveSubjectRoles,
} from '~/lib/rbac/identity'
import type { RbacUserSource } from '~/lib/rbac/types'
import { useAuthStore } from '~/stores/auth'
import type { Permission, Role } from '~/types'

export const RBAC_USER_SOURCE_KEY: InjectionKey<RbacUserSource> = Symbol('RbacUserSource')

export function useRbac(source?: RbacUserSource) {
  // Three-tier resolution: param → provide/inject → useAuthStore
  const resolved = source ?? inject(RBAC_USER_SOURCE_KEY, null)

  let role: RbacUserSource['role']
  let roles: NonNullable<RbacUserSource['roles']>
  let permissions: RbacUserSource['permissions']

  if (resolved) {
    role = resolved.role
    // A source written for one role per user has no `roles`: it is that role.
    roles = computed(() => resolveSubjectRoles({ role: role.value, roles: resolved.roles?.value }))
    permissions = resolved.permissions
  } else {
    const auth = useAuthStore()
    // The primary role, as the auth store reads it: see `userRole` there.
    role = computed(() => resolvePrimaryRole(auth.user) ?? auth.user?.role ?? 'guest')
    // Resolved here rather than read off the store, like the permissions below.
    roles = computed(() => resolveSubjectRoles(auth.user))
    // The resolution the route guard uses (see `resolveSubjectPermissions`), so
    // what the sidebar offers is what the guard opens. Resolved here rather
    // than read off the store so it holds for a store a project has edited.
    permissions = computed(() => resolveSubjectPermissions(auth.user))
  }

  function can(permission: Permission, context?: Record<string, unknown>): boolean {
    return hasPermission(
      role.value,
      permissions.value as Permission[],
      permission,
      context,
      'component',
    )
  }

  function canAny(perms: Permission[]): boolean {
    return hasAnyPermission(
      role.value,
      permissions.value as Permission[],
      perms,
      undefined,
      'component',
    )
  }

  function canAll(perms: Permission[]): boolean {
    return hasAllPermissions(
      role.value,
      permissions.value as Permission[],
      perms,
      undefined,
      'component',
    )
  }

  function canNamespace(namespace: string): boolean {
    return hasNamespacePermission(role.value, permissions.value as Permission[], namespace)
  }

  /**
   * Whether the user is `requiredRole`, or holds a role that inherits from it.
   * Every role counts, not only the primary one. A user with no role the app
   * has is judged by `role` alone, which is `guest` for a visitor.
   */
  function isAtLeast(requiredRole: Role): boolean {
    return roles.value.length > 0
      ? anyRoleAtLeast(roles.value, requiredRole)
      : isRoleAtLeast(role.value, requiredRole)
  }

  /** Whether the user was given exactly this role, as primary or as one of several. */
  function hasRole(candidate: Role): boolean {
    return roles.value.includes(candidate)
  }

  return {
    role,
    roles,
    permissions,
    can,
    canAny,
    canAll,
    canNamespace,
    isAtLeast,
    hasRole,
  }
}
