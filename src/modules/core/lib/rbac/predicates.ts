import { createScopedLogger } from '~/lib/logger'
import { getRbacBackend } from '~/lib/runtime'

import type { PredicateFn } from './types'

// ─── Permission Predicate Registry ────────────────────────
// Storage lives in the app-installed `RbacBackend`.

const predicateLogger = createScopedLogger('rbac:predicate')

/**
 * Register a predicate function for a specific permission.
 * The predicate receives a context object and returns whether access is granted.
 */
export function registerPredicate(permission: string, fn: PredicateFn): void {
  getRbacBackend().predicates.set(permission, fn)
}

/**
 * Evaluate a predicate for a permission with the given context.
 * Returns:
 * - `true`/`false` when a predicate is registered and context is provided
 * - `null` when no predicate is registered or no context is provided (signals fallback to base check)
 *
 * A predicate that throws is treated as a denial and logged — failing closed
 * prevents a buggy predicate from accidentally granting access.
 */
export function evaluatePredicate(
  permission: string,
  context: Record<string, unknown> | undefined,
): boolean | null {
  if (!context) return null
  const fn = getRbacBackend().predicates.get(permission)
  if (!fn) return null
  try {
    return fn(context)
  } catch (err) {
    predicateLogger.error(`Predicate for "${permission}" threw — denying access`, { err })
    return false
  }
}

/** @internal Clear all predicates — test-only. */
export function clearPredicates(): void {
  getRbacBackend().predicates.clear()
}
