import { useApiRuntimeStore } from '@/stores/api-runtime'
import rbacOverrides from '~/config/rbac.overrides'
import { resolveRolePermissions } from '~/lib/rbac/inheritance'
import { assertRbacConfig, resolveRbacOverrides } from '~/lib/rbac/overrides'
import { knownRoles } from '~/lib/rbac/role-graph'
import type { AuthorizationHookFn, Permission, PredicateFn, Role } from '~/lib/rbac/types'
import {
  installApiAuthBackend,
  installRbacBackend,
  installRbacConfig,
  installValidationCacheBackend,
  type RbacBackend,
  type RbacConfig,
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
 *
 * Called through a type that states the second parameter. This file is replaced
 * by an upgrade while a `core/lib/rbac/inheritance.ts` the project edited is
 * not (granting a permission there is what the 1.0 docs said to do), and its
 * `resolveRolePermissions` takes the role alone: calling that with two
 * arguments does not compile. A function of one parameter does fit this type,
 * so both do, and the old one ignores the overrides until it is merged.
 *
 * A project's own roles are walked as well. No built-in role inherits from
 * one, so a permission granted to a project role alone is held by nobody in
 * the hierarchy, and would otherwise be reported as unregistered. With no
 * project role this is `super_admin`'s set, in the order it always had.
 */
const resolveSeedPermissions: (role: Role, config: RbacConfig) => Permission[] =
  resolveRolePermissions
export const BUILTIN_PERMISSIONS: Permission[] = [
  ...new Set(knownRoles(rbacConfig).flatMap((role) => resolveSeedPermissions(role, rbacConfig))),
]

/**
 * Build a fresh RBAC backend (Set/Map registries) seeded with built-in
 * permissions. Held inside `createGlobalState` so the same instance is
 * shared across the app and resettable from the central test reset helper.
 */
const rbacBackendState = createGlobalState((): RbacBackend => {
  const permissions = new Set<string>()
  const predicates = new Map<string, PredicateFn>()
  const hooks = new Set<AuthorizationHookFn>()
  const reportedNames = new Set<string>()

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
    reportedNames.clear()
    seedBuiltins()
  }

  return { permissions, predicates, hooks, reportedNames, resetPermissions, reset }
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
  // A role table with a cycle or an unknown parent stops the boot here, with a
  // message naming rbac.overrides.ts. Until it is fixed such a role holds
  // nothing either way: resolving the seam already left it out.
  assertRbacConfig(rbacConfig)
  installRbacConfig(rbacConfig)
  installRbacBackend(rbacBackendState())
  installValidationCacheBackend(validationCacheBackendState())
}

/** @internal Test-only — re-seed RBAC and clear validation cache. */
export function resetRuntimeBackends(): void {
  rbacBackendState().reset()
  validationCacheBackendState().clear()
}
