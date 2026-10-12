import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'

/**
 * A project's roles reach the runtime through `installRuntimeBackends()`, like
 * its grants (see `rbac-overrides-seeding.test.ts`, whose shape this follows).
 * The seeded file defines no role in the template, so it is replaced here by
 * one that does.
 */
vi.mock('~/config/rbac.overrides', () => ({
  default: {
    roles: {
      auditor: { inherits: ['viewer'], label: 'Auditor' },
      billing_admin: { inherits: ['member', 'auditor'], assignable: false },
    },
    // Held by no built-in role: only the auditor, and what inherits from it.
    grants: { auditor: ['ledger:read'] },
    withdrawn: ['users:delete'],
  },
}))

let backends: typeof import('@/state/runtime-backends')
let rbac: typeof import('@/lib/rbac')
let runtime: typeof import('@/lib/runtime')

beforeAll(async () => {
  vi.resetModules()
  backends = await import('@/state/runtime-backends')
  rbac = await import('@/lib/rbac')
  runtime = await import('@/lib/runtime')

  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  backends.installRuntimeBackends()
  backends.resetRuntimeBackends()
})

describe('rbac.overrides.ts roles wiring', () => {
  it('installs the project roles with their ancestry worked out', () => {
    const roles = runtime.tryGetRbacConfig()?.roles

    expect([...(roles?.keys() ?? [])]).toEqual(['auditor', 'billing_admin'])
    expect(roles?.get('auditor')?.includes).toEqual(['auditor', 'viewer', 'guest'])
    expect(roles?.get('billing_admin')?.includes).toEqual([
      'billing_admin',
      'member',
      'viewer',
      'guest',
      'auditor',
    ])
    expect(runtime.tryGetRbacConfig()?.problems).toBeUndefined()
  })

  it('makes them roles the app has', () => {
    expect(rbac.knownRoles()).toEqual([...rbac.BUILTIN_ROLES, 'auditor', 'billing_admin'])
    expect(rbac.getRoleDefinitions().map((role) => role.name)).toEqual(rbac.knownRoles())
    expect(rbac.getAssignableRoles().map((role) => role.name)).toEqual([
      ...rbac.BUILTIN_ROLES,
      'auditor',
    ])
    expect(rbac.resolveSubjectPermissions({ roles: ['auditor'] })).toContain('ledger:read')
  })

  it('seeds the registry with a permission only a project role holds', () => {
    // No built-in role inherits from a project role, so walking down from
    // super_admin alone would miss it and report it as unregistered.
    expect(rbac.resolveRolePermissions('super_admin')).not.toContain('ledger:read')
    expect(backends.BUILTIN_PERMISSIONS).toContain('ledger:read')
    expect(rbac.getRegisteredPermissions().has('ledger:read')).toBe(true)
    expect(rbac.validateBuiltinRolePermissions()).toEqual([])
    // What the project withdrew is still out, for every role.
    expect(backends.BUILTIN_PERMISSIONS).not.toContain('users:delete')
  })

  it('keeps the seed in the order it had, with the project’s additions after', () => {
    const superAdmin = rbac.resolveRolePermissions('super_admin')

    expect(backends.BUILTIN_PERMISSIONS.slice(0, superAdmin.length)).toEqual(superAdmin)
    expect(backends.BUILTIN_PERMISSIONS.slice(superAdmin.length)).toEqual(['ledger:read'])
  })
})
