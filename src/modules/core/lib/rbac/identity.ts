import { tryGetRbacConfig } from '~/lib/runtime'

import { resolveRolePermissions } from './inheritance'
import { includedRoles, isKnownRole } from './role-graph'
import type { Permission, Role } from './types'
import { reportUnknownName } from './unknown-names'

/** The fields of a user that decide what they may do. */
export interface PermissionSubject {
  /** The primary role: the one to show, and the only one for most users. */
  role?: Role | null
  /**
   * Every role the user holds, when the backend sends more than one: an array
   * of role names. Typed `unknown` because that is how it is read. A value of
   * any other shape grants nothing, and a project whose `User` already carries
   * a `roles` field of its own still type-checks against this.
   */
  roles?: unknown
  permissions?: readonly Permission[] | null
}

/** More names than this in one `roles` array are not read: nobody holds that many roles. */
const MAX_SUBJECT_ROLES = 256

/**
 * The roles a user holds that the app has: `role` first, then `roles` in the
 * order given, each once.
 *
 * A name the app does not declare is dropped, never treated as a role: a new
 * role at the identity provider, a typo from the backend, a project role whose
 * definition was rejected. It is reported once in development. A user left
 * with no role is what a user with no role always was: nobody's permissions.
 */
export function resolveSubjectRoles(subject: PermissionSubject | null | undefined): Role[] {
  if (!subject) return []

  const named: unknown[] = []
  // An empty role names no role, which is what absent means.
  if (subject.role) named.push(subject.role)
  if (Array.isArray(subject.roles)) named.push(...subject.roles.slice(0, MAX_SUBJECT_ROLES))

  const config = tryGetRbacConfig()
  const roles: Role[] = []
  for (const name of named) {
    if (!isKnownRole(name, config)) reportUnknownName('role', name)
    else if (!roles.includes(name)) roles.push(name)
  }
  return roles
}

/**
 * The one role to show for a user, and to hand to code that takes a single
 * role. `undefined` when the user holds no role the app has.
 *
 * It is `role` when the backend sent one the app has. Otherwise it is the first
 * of `roles`, in the order sent, that no other role of the user inherits from:
 * for `['viewer', 'admin']` that is `admin`, because an admin is a viewer
 * already. With one role there is nothing to choose.
 */
export function resolvePrimaryRole(
  subject: PermissionSubject | null | undefined,
): Role | undefined {
  const roles = resolveSubjectRoles(subject)
  if (roles.length <= 1 || roles[0] === subject?.role) return roles[0]

  return (
    roles.find((role) =>
      roles.every((other) => other === role || !includedRoles(other).includes(role)),
    ) ?? roles[0]
  )
}

/**
 * Whether one of `roles` is `required`, or inherits from it. The many-role
 * form of `isRoleAtLeast`: a user is at least a manager when any role they
 * hold is.
 */
export function anyRoleAtLeast(roles: readonly Role[], required: Role): boolean {
  return roles.some((role) => includedRoles(role).includes(required))
}

/**
 * The permissions a user effectively holds.
 *
 * An explicit `permissions` array wins, including an empty one: the backend
 * said what this user may do, and role grants must not widen it. Without one,
 * the set is the union of what each of the user's roles holds, through the
 * hierarchy and the project's grants. No user, or no role the app has, holds
 * nothing.
 *
 * What the project withdrew is taken off an explicit set too: a permission the
 * app retired is not one a backend can hand back. A permission string the app
 * does not declare is left in the list as sent. Nothing asks for it, so it
 * grants nothing.
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

  if (subject.permissions) {
    const withdrawn = tryGetRbacConfig()?.withdrawn ?? []
    return withdrawn.length === 0
      ? [...subject.permissions]
      : subject.permissions.filter((permission) => !withdrawn.includes(permission))
  }

  const roles = resolveSubjectRoles(subject)
  if (roles.length === 0) return []
  // One role, which is nearly every user: exactly what the role resolves to.
  if (roles.length === 1) return resolveRolePermissions(roles[0]!)

  return [...new Set(roles.flatMap((role) => resolveRolePermissions(role)))]
}
