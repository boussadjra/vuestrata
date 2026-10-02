import { resolveRolePermissions } from './inheritance'
import type { Permission, Role } from './types'

/** The fields of a user that decide what they may do. */
export interface PermissionSubject {
  role?: Role | null
  permissions?: readonly Permission[] | null
}

/**
 * The permissions a user effectively holds.
 *
 * An explicit `permissions` array wins, including an empty one: the backend
 * said what this user may do, and role grants must not widen it. Without one,
 * the set derives from the role through the hierarchy and the project's grants.
 * No user, or a role the hierarchy does not know, holds nothing.
 *
 * This is the ONE place that rule lives. The route guard, `useRbac` and the
 * auth store's `userPermissions` all resolve through it. They used to answer
 * separately, and disagreed for a user the backend described by role alone: the
 * sidebar (which fell back to the role) offered links the guard (which did not)
 * then sent to /403.
 *
 * The app layer imports it by path (`~/lib/rbac/identity`) rather than through
 * the barrel. This file is new in 1.1, so an upgrade always delivers it; a
 * barrel a project has edited stays as it was and would not export it.
 */
export function resolveSubjectPermissions(
  subject: PermissionSubject | null | undefined,
): Permission[] {
  if (!subject) return []
  if (subject.permissions) return [...subject.permissions]
  return subject.role ? resolveRolePermissions(subject.role) : []
}
