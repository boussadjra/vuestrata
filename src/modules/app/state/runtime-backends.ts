import { useApiRuntimeStore } from '@/stores/api-runtime'
import rbacOverrides from '~/config/rbac.overrides'
import { resolveRolePermissions } from '~/lib/rbac/inheritance'
import { resolveRbacOverrides } from '~/lib/rbac/overrides'
import type { AuthorizationHookFn, Permission, PredicateFn } from '~/lib/rbac/types'
import {
  installApiAuthBackend,
  installRbacBackend,
  installRbacConfig,
  installValidationCacheBackend,
  type RbacBackend,
  type ValidationCacheBackend,
} from '~/lib/runtime'
import type { ValidationAdapter } from '~/types'

/**
 * The project's `rbac.overrides.ts`, as the runtime slot holds it. Imported
 * statically on purpose: a deleted seam fails the build instead of quietly
 * restoring the defaults.
 */
const rbacConfig = resolveRbacOverrides(rbacOverrides)

/**
 * Every permission the RBAC registry is seeded with.
 *
 * Derived from the role hierarchy rather than hand-listed. The hand-written
 * copy went stale the moment a module added a permission: `validatePermissions`
 * then warned about a permission that was perfectly legitimate, and — worse —
 * the demo super-admin was seeded without it, so an admin silently lost access
 * to a page. Walking the top of the hierarchy makes drift impossible, because
 * a permission no role can ever hold is a permission that does nothing.
 *
 * Resolved against the project's overrides, so its grants are in the seed and
 * what it withdrew is not.
 */
export const BUILTIN_PERMISSIONS: Permission[] = resolveRolePermissions('super_admin', rbacConfig)

/**
 * Build a fresh RBAC backend (Set/Map registries) seeded with built-in
 * permissions. Held inside `createGlobalState` so the same instance is
 * shared across the app and resettable from the central test reset helper.
 */
const rbacBackendState = createGlobalState((): RbacBackend => {
  const permissions = new Set<string>()
  const predicates = new Map<string, PredicateFn>()
  const hooks = new Set<AuthorizationHookFn>()

  function seedBuiltins(): void {
    for (const perm of BUILTIN_PERMISSIONS) permissions.add(perm)
  }
  seedBuiltins()

  function resetPermissions(): void {
    permissions.clear()
    seedBuiltins()
  }

  function reset(): void {
    permissions.clear()
    predicates.clear()
    hooks.clear()
    seedBuiltins()
  }

  return { permissions, predicates, hooks, resetPermissions, reset }
})

/** Build a fresh validation-adapter cache backend. */
const validationCacheBackendState = createGlobalState(
  (): ValidationCacheBackend<ValidationAdapter> => {
    const cache = new Map<string, ValidationAdapter>()
    return {
      get: (name) => cache.get(name),
      set: (name, value) => {
        cache.set(name, value)
      },
      delete: (name) => {
        cache.delete(name)
      },
      clear: () => {
        cache.clear()
      },
    }
  },
)

/**
 * Wire all `core/lib` runtime injection slots from app-layer state containers.
 * Must be called after `app.use(pinia)` so Pinia stores are resolvable.
 *
 * This function used to end with an unconditional `await seedDemoSuperAdmin()`.
 * There was no dev check and no adapter check, so EVERY boot in EVERY
 * environment — including a real production deployment against a real backend —
 * wrote a `super_admin` user holding every registered permission into the
 * browser's IndexedDB. Demo seeding now lives in `state/demo/seed.ts` and is
 * called only from the `__VUESTRATA_DEMO__` branch of `boot()`.
 */
export function installRuntimeBackends(): void {
  const apiRuntime = useApiRuntimeStore()
  installApiAuthBackend(apiRuntime.backend)
  installRbacConfig(rbacConfig)
  installRbacBackend(rbacBackendState())
  installValidationCacheBackend(validationCacheBackendState())
}

/** @internal Test-only — re-seed RBAC and clear validation cache. */
export function resetRuntimeBackends(): void {
  rbacBackendState().reset()
  validationCacheBackendState().clear()
}
