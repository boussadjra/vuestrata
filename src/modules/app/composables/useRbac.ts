import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  isRoleAtLeast,
  getRolePermissions,
  hasNamespacePermission,
} from '~/lib/rbac'
import type { RbacUserSource } from '~/lib/rbac/types'
import { useAuthStore } from '~/stores/auth'
import type { Permission, Role } from '~/types'

export const RBAC_USER_SOURCE_KEY: InjectionKey<RbacUserSource> = Symbol('RbacUserSource')

export function useRbac(source?: RbacUserSource) {
  // Three-tier resolution: param → provide/inject → useAuthStore
  const resolved = source ?? inject(RBAC_USER_SOURCE_KEY, null)

  let role: RbacUserSource['role']
  let permissions: RbacUserSource['permissions']

  if (resolved) {
    role = resolved.role
    permissions = resolved.permissions
  } else {
    const auth = useAuthStore()
    role = computed(() => auth.user?.role ?? 'guest')
    permissions = computed(() => auth.user?.permissions ?? getRolePermissions(role.value))
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

  function isAtLeast(requiredRole: Role): boolean {
    return isRoleAtLeast(role.value, requiredRole)
  }

  return {
    role,
    permissions,
    can,
    canAny,
    canAll,
    canNamespace,
    isAtLeast,
  }
}
