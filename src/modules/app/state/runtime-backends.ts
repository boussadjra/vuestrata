import { useApiRuntimeStore } from '@/stores/api-runtime'
import type { AuthorizationHookFn, PredicateFn } from '~/lib/rbac/types'
import type { BuiltinPermission } from '~/lib/rbac/types'
import {
  installApiAuthBackend,
  installRbacBackend,
  installValidationCacheBackend,
  type RbacBackend,
  type ValidationCacheBackend,
} from '~/lib/runtime'
import type { ValidationAdapter } from '~/types'

const BUILTIN_PERMISSIONS: BuiltinPermission[] = [
  'users:read',
  'users:create',
  'users:update',
  'users:delete',
  'roles:read',
  'roles:assign',
  'billing:read',
  'billing:manage',
  'dashboard:read',
  'dashboard:export',
  'settings:read',
  'settings:update',
  'reports:read',
  'reports:create',
  'reports:export',
  'audit:read',
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
 * Wire all `core/lib` runtime injection slots from app-layer state
 * containers. Must be called after `app.use(pinia)` so Pinia stores are
 * resolvable.
 */
export function installRuntimeBackends(): void {
  const apiRuntime = useApiRuntimeStore()
  installApiAuthBackend(apiRuntime.backend)
  installRbacBackend(rbacBackendState())
  installValidationCacheBackend(validationCacheBackendState())
}

/** @internal Test-only — re-seed RBAC and clear validation cache. */
export function resetRuntimeBackends(): void {
  rbacBackendState().reset()
  validationCacheBackendState().clear()
}
