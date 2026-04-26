import { emitAuthorizationEvent } from './hooks'
import { resolveRolePermissions } from './inheritance'
import { evaluatePredicate } from './predicates'
import type { Role, Permission } from './types'
import type { AuthorizationEvent } from './types'

/**
 * Resolve the effective permission set for a user. Centralised so the three
 * public check helpers below all use identical fallback semantics: an
 * explicit user-permission array takes precedence over the role-derived set.
 */
function effectivePermissions(
  userRole: Role,
  userPermissions: Permission[] | undefined,
): Permission[] {
  return userPermissions ?? resolveRolePermissions(userRole)
}

/**
 * Check a single permission with optional predicate evaluation. If a
 * predicate is registered for `permission` AND `context` is provided, the
 * predicate result wins; otherwise fall back to the role-based set.
 */
function checkSingle(
  permission: Permission,
  perms: Permission[],
  context: Record<string, unknown> | undefined,
): boolean {
  const predicateResult = evaluatePredicate(permission, context)
  if (predicateResult !== null) return predicateResult
  return perms.includes(permission)
}

/**
 * Check if a user has a specific permission.
 * When context is provided, evaluates a registered predicate first.
 * Falls back to the standard role-based check if no predicate applies.
 */
export function hasPermission(
  userRole: Role,
  userPermissions: Permission[] | undefined,
  required: Permission,
  context?: Record<string, unknown>,
  source: AuthorizationEvent['source'] = 'component',
): boolean {
  const perms = effectivePermissions(userRole, userPermissions)
  const granted = checkSingle(required, perms, context)
  emitAuthorizationEvent({ permission: required, granted, userRole, source, context })
  return granted
}

export function hasAnyPermission(
  userRole: Role,
  userPermissions: Permission[] | undefined,
  required: Permission[],
  context?: Record<string, unknown>,
  source: AuthorizationEvent['source'] = 'component',
): boolean {
  const perms = effectivePermissions(userRole, userPermissions)
  const granted = required.some((p) => checkSingle(p, perms, context))
  emitAuthorizationEvent({ permission: required, granted, userRole, source, context })
  return granted
}

export function hasAllPermissions(
  userRole: Role,
  userPermissions: Permission[] | undefined,
  required: Permission[],
  context?: Record<string, unknown>,
  source: AuthorizationEvent['source'] = 'component',
): boolean {
  const perms = effectivePermissions(userRole, userPermissions)
  const granted = required.every((p) => checkSingle(p, perms, context))
  emitAuthorizationEvent({ permission: required, granted, userRole, source, context })
  return granted
}
