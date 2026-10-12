// ─── RBAC Barrel ──────────────────────────────────────────
// Re-exports from sub-modules. All existing export names are preserved.

// Types
export type {
  Role,
  Permission,
  RoleDefinition,
  BuiltinPermission,
  AppPermissions,
  BuiltinRole,
  AppRoles,
  RoleOf,
  ProjectRole,
  ProjectRoles,
  ResolvedRoleDefinition,
  RbacOverrides,
  RbacUserSource,
  AuthorizationEvent,
  AuthorizationHookFn,
  PredicateFn,
  ReactiveValue,
} from './types'

// Registry
export {
  registerPermissions,
  getRegisteredPermissions,
  tryGetRegisteredPermissions,
  isRegisteredPermission,
  validatePermissions,
  clearRegistry,
} from './registry'

// Project overrides
export { defineRbacOverrides, resolveRbacOverrides, assertRbacConfig } from './overrides'

// Which roles exist: the built-in six and the project's own
export { BUILTIN_ROLES, isBuiltinRole, isKnownRole, knownRoles } from './role-graph'
export { getRoleDefinitions, getAssignableRoles, roleLabel } from './roles'
export type { RoleLabelTranslator } from './roles'

// Inheritance & role hierarchy
export {
  ROLE_HIERARCHY,
  resolveRolePermissions,
  buildRoleDefinitions,
  isRoleAtLeast,
} from './inheritance'

// Permission checks
export { hasPermission, hasAnyPermission, hasAllPermissions } from './checks'

// One rule for "what does this user hold", shared by the guard, `useRbac` and the auth store
export {
  resolveSubjectPermissions,
  resolveSubjectRoles,
  resolvePrimaryRole,
  anyRoleAtLeast,
} from './identity'
export type { PermissionSubject } from './identity'

// Namespace checks
export { hasNamespacePermission } from './namespace'

// Authorization hooks
export { onAuthorizationCheck, emitAuthorizationEvent, clearHooks } from './hooks'

// Predicates
export { registerPredicate, evaluatePredicate, clearPredicates } from './predicates'

// ─── Legacy Compatibility ─────────────────────────────────
// ROLE_DEFINITIONS and getRolePermissions preserved for existing consumers.

import { buildRoleDefinitions, resolveRolePermissions } from './inheritance'
import { validatePermissions as _validatePermissions } from './registry'
import type { BuiltinRole, Role, Permission, RoleDefinition } from './types'

/**
 * The built-in roles. Built when this barrel is first imported, which is before
 * the project's `rbac.overrides.ts` is installed, so a role the project defines
 * is not in it: `getRoleDefinitions()` lists every role.
 */
export const ROLE_DEFINITIONS: Record<BuiltinRole, RoleDefinition> = buildRoleDefinitions()

/**
 * Validate that every permission referenced by the built-in role definitions
 * is registered with the permission registry. Intended to be called ONCE
 * after modules have finished registering their own permissions (see
 * `useModuleStore.initModules`). Kept as an explicit function so that merely
 * importing the RBAC barrel has no side effects \u2014 previously this ran at
 * import time, which triggered misleading \u201Cunregistered permission\u201D
 * warnings because modules had not registered their permissions yet and
 * produced nondeterministic ordering with test setup.
 */
export function validateBuiltinRolePermissions(): string[] {
  const allPerms: string[] = []
  for (const def of Object.values(ROLE_DEFINITIONS)) {
    allPerms.push(...def.permissions)
  }
  return _validatePermissions(allPerms)
}

export function getRolePermissions(role: Role): Permission[] {
  return resolveRolePermissions(role)
}
