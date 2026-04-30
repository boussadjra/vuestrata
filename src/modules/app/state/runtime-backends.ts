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

import { getDemoUsers, setDemoUsers } from './demo-store'

export const BUILTIN_PERMISSIONS: BuiltinPermission[] = [
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

async function seedDemoSuperAdmin(): Promise<void> {
  const users = await getDemoUsers()
  if (users.length > 0) return

  const allPermissions = [...rbacBackendState().permissions] as import('~/types').Permission[]
  const now = new Date().toISOString()
  await setDemoUsers([
    {
      id: '1',
      email: 'demo@vuestrata.dev',
      name: 'Demo Admin',
      role: 'super_admin',
      permissions: allPermissions,
      emailVerified: true,
      mfaEnabled: false,
      provider: 'credentials',
      createdAt: now,
      lastLoginAt: now,
    },
  ])
}

/**
 * Wire all `core/lib` runtime injection slots from app-layer state
 * containers. Must be called after `app.use(pinia)` so Pinia stores are
 * resolvable.
 */
export async function installRuntimeBackends(): Promise<void> {
  const apiRuntime = useApiRuntimeStore()
  installApiAuthBackend(apiRuntime.backend)
  installRbacBackend(rbacBackendState())
  installValidationCacheBackend(validationCacheBackendState())
  await seedDemoSuperAdmin()
}

/** @internal Test-only — re-seed RBAC and clear validation cache. */
export function resetRuntimeBackends(): void {
  rbacBackendState().reset()
  validationCacheBackendState().clear()
}
