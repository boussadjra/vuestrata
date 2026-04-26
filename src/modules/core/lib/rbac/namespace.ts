import { resolveRolePermissions } from './inheritance'
import type { Role, Permission } from './types'

/**
 * Check if a user has any permission within a given namespace.
 * Returns true if any of the user's effective permissions starts with `namespace:`.
 */
export function hasNamespacePermission(
  userRole: Role,
  userPermissions: Permission[] | undefined,
  namespace: string,
): boolean {
  const perms = userPermissions ?? resolveRolePermissions(userRole)
  const prefix = `${namespace}:`
  return perms.some((p) => p.startsWith(prefix))
}
