import { createScopedLogger } from '~/lib/logger'
import { getRbacBackend } from '~/lib/runtime'

import type { AuthorizationEvent, AuthorizationHookFn } from './types'

// ─── Authorization Hook System ────────────────────────────
// Multi-subscriber, synchronous. Each hook is failure-isolated.
// Storage lives in the app-installed `RbacBackend`.

const rbacLogger = createScopedLogger('rbac')

/**
 * Register an authorization hook that fires on every permission check.
 * Returns an unsubscribe function.
 */
export function onAuthorizationCheck(callback: AuthorizationHookFn): () => void {
  const { hooks } = getRbacBackend()
  hooks.add(callback)
  return () => {
    hooks.delete(callback)
  }
}

/**
 * Emit an authorization event to all registered hooks.
 * Each hook is called in a try-catch — a throwing hook does not
 * affect other hooks or the permission check itself.
 */
export function emitAuthorizationEvent(event: AuthorizationEvent): void {
  for (const hook of getRbacBackend().hooks) {
    try {
      hook(event)
    } catch (err) {
      rbacLogger.error('Authorization hook threw:', err)
    }
  }
}

/** @internal Clear all hooks — test-only. */
export function clearHooks(): void {
  getRbacBackend().hooks.clear()
}
