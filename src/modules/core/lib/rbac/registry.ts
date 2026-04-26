import { createScopedLogger } from '~/lib/logger'
import { getRbacBackend } from '~/lib/runtime'

const registryLogger = createScopedLogger('rbac:registry')

// ─── Permission Registry ──────────────────────────────────
// Storage lives in the app-installed `RbacBackend` (see
// `~/lib/runtime`). The backend is seeded with built-in permissions on
// install; this module is a thin set of typed wrappers on top.

/**
 * Register domain-specific permissions for a module.
 * Short actions are prefixed with `namespace:action`; fully-qualified
 * permission keys are kept as-is.
 * Idempotent — registering the same permission twice is a no-op.
 */
export function registerPermissions(namespace: string, actions: string[]): void {
  const { permissions } = getRbacBackend()
  for (const action of actions) {
    permissions.add(action.includes(':') ? action : `${namespace}:${action}`)
  }
}

/** Get all registered permissions (built-in + dynamic). */
export function getRegisteredPermissions(): ReadonlySet<string> {
  return getRbacBackend().permissions
}

/** Check if a permission string is registered. */
export function isRegisteredPermission(permission: string): boolean {
  return getRbacBackend().permissions.has(permission)
}

/** @internal Clear registry — test-only. */
export function clearRegistry(): void {
  getRbacBackend().resetPermissions()
}

/**
 * Validate that a list of permission strings are all registered.
 * Logs a warning for each unregistered permission (catches typos at startup).
 * Returns the list of invalid permissions.
 */
export function validatePermissions(permissions: string[]): string[] {
  const { permissions: registry } = getRbacBackend()
  const invalid: string[] = []
  for (const perm of permissions) {
    if (!registry.has(perm)) {
      registryLogger.warn(`Unregistered permission referenced: "${perm}"`)
      invalid.push(perm)
    }
  }
  return invalid
}
