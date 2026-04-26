// ─── RBAC Barrel ──────────────────────────────────────────
// Re-exports from sub-modules. All existing export names are preserved.

// Types
export type {
  Role,
  Permission,
  RoleDefinition,
  BuiltinPermission,
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
  isRegisteredPermission,
  validatePermissions,
  clearRegistry,
} from './registry'

// Inheritance & role hierarchy
export {
  ROLE_HIERARCHY,
  resolveRolePermissions,
  buildRoleDefinitions,
  isRoleAtLeast,
} from './inheritance'

// Permission checks
export { hasPermission, hasAnyPermission, hasAllPermissions } from './checks'

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
import type { Role, Permission, RoleDefinition } from './types'

export const ROLE_DEFINITIONS: Record<Role, RoleDefinition> = buildRoleDefinitions()

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
