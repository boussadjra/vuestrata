import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'

/**
 * `app/config/rbac.overrides.ts` reaches the runtime through
 * `installRuntimeBackends()`. The seeded file is empty in the template, so it
 * is replaced here by one that grants and withdraws something: what is asserted
 * is the wiring, not the file's contents.
 *
 * Everything is imported after the mock, from a fresh module graph — the test
 * setup has already loaded the real backends, and their `BUILTIN_PERMISSIONS`
 * is fixed the moment they are.
 */
vi.mock('~/config/rbac.overrides', () => ({
  default: {
    grants: { viewer: ['billing:manage'] },
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

describe('rbac.overrides.ts wiring', () => {
  it('installs the project overrides as the runtime slot', () => {
    expect(runtime.tryGetRbacConfig()).toEqual({
      grants: { viewer: ['billing:manage'] },
      withdrawn: ['users:delete'],
    })
  })

  it('seeds the registry with what the project granted, and without what it withdrew', () => {
    const registered = rbac.getRegisteredPermissions()

    expect(backends.BUILTIN_PERMISSIONS).toContain('billing:manage')
    expect(backends.BUILTIN_PERMISSIONS).not.toContain('users:delete')
    expect(registered.has('billing:manage')).toBe(true)
    expect(registered.has('users:delete')).toBe(false)
    // The rest of the hierarchy is untouched.
    expect(registered.has('users:read')).toBe(true)
  })

  it('applies to the role definitions the app reads', () => {
    expect(rbac.ROLE_DEFINITIONS.super_admin.permissions).not.toContain('users:delete')
    expect(rbac.ROLE_DEFINITIONS.viewer.permissions).toContain('billing:manage')
  })
})
