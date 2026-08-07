import { createScopedLogger } from '~/lib/logger'
import {
  emitAuthorizationEvent,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isRoleAtLeast,
} from '~/lib/rbac'
import type { Permission, Role } from '~/types'

const guardLogger = createScopedLogger('router')

/**
 * The subset of a resolved route the guard actually reads. Declared structurally
 * rather than importing `RouteLocationNormalized` so this module — and its
 * tests — do not need the router, the generated route table, or the layout
 * virtual module.
 */
export interface GuardedRoute {
  fullPath: string
  meta: {
    requiresAuth?: boolean
    requiredRole?: Role
    requiredPermission?: Permission
    requiredPermissions?: Permission[]
    permissionMode?: 'all' | 'any'
    permissionContext?:
      | Record<string, unknown>
      | ((to: GuardedRoute) => Record<string, unknown> | null | undefined)
  }
}

export interface GuardSubject {
  isAuthenticated: boolean
  role: Role
  permissions: Permission[] | undefined
}

export type GuardDecision =
  | { type: 'allow' }
  | { type: 'login'; redirect: string }
  | { type: 'forbidden' }

/**
 * Decide whether `subject` may open `route`.
 *
 * Extracted from the `beforeEach` hook so the rules can be tested directly.
 * They are the app's only client-side access control, and they were previously
 * only reachable through a fully-booted router — which is part of why the
 * anonymous-bypass bug below survived.
 *
 * IMPORTANT: this is a UI-affordance layer, not a security boundary. It runs in
 * the browser against data the browser controls. Every permission expressed
 * here must be independently enforced by the backend.
 */
export function resolveRouteAccess(route: GuardedRoute, subject: GuardSubject): GuardDecision {
  if (route.meta.requiresAuth === true && !subject.isAuthenticated) {
    return { type: 'login', redirect: route.fullPath }
  }

  const hasRbacConstraint =
    route.meta.requiredRole !== undefined ||
    route.meta.requiredPermission !== undefined ||
    (route.meta.requiredPermissions?.length ?? 0) > 0

  if (!hasRbacConstraint) return { type: 'allow' }

  // Role and permission checks run for EVERY visitor.
  //
  // They used to be nested inside `if (isAuthenticated)`, so a route declaring
  // `requiredPermission` but omitting `requiresAuth: true` was wide open to
  // anonymous users — the check was skipped for exactly the visitors it existed
  // to stop. An anonymous subject evaluates as `guest`, whose permission set is
  // empty, so such a route now fails closed.
  const { role, permissions } = subject

  if (route.meta.requiredRole && !isRoleAtLeast(role, route.meta.requiredRole)) {
    return { type: 'forbidden' }
  }

  let context: Record<string, unknown> | undefined
  if (route.meta.permissionContext) {
    try {
      context =
        typeof route.meta.permissionContext === 'function'
          ? (route.meta.permissionContext(route) ?? undefined)
          : route.meta.permissionContext
    } catch (err) {
      // Fail closed. A resolver that throws cannot be trusted to supply the
      // data a predicate needs, and proceeding without it could grant access to
      // a resource-scoped route on the base role check alone — exactly the
      // escalation the context exists to prevent.
      guardLogger.error('permissionContext resolver threw', { path: route.fullPath, err })
      emitAuthorizationEvent({
        permission: 'permissionContext:resolver',
        granted: false,
        userRole: role,
        source: 'guard',
        context: { error: 'permissionContext resolver threw', path: route.fullPath },
      })
      return { type: 'forbidden' }
    }
  }

  // Multi-permission check takes precedence over the singular form.
  if (route.meta.requiredPermissions?.length) {
    const mode = route.meta.permissionMode ?? 'all'
    const checkFn = mode === 'any' ? hasAnyPermission : hasAllPermissions
    if (!checkFn(role, permissions, route.meta.requiredPermissions, context, 'guard')) {
      return { type: 'forbidden' }
    }
  } else if (route.meta.requiredPermission) {
    if (!hasPermission(role, permissions, route.meta.requiredPermission, context, 'guard')) {
      return { type: 'forbidden' }
    }
  }

  return { type: 'allow' }
}
