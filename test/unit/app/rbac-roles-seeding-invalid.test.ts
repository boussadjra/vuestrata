import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'

/**
 * A role table that is wrong stops the boot, and says where.
 *
 * `installRuntimeBackends()` is a step of `boot()`, so the throw below is the
 * boot-failure screen in an app. Importing the module must not throw: it
 * resolves the seam while it loads, where an exception would stop the page
 * before anything could report it.
 */
vi.mock('~/config/rbac.overrides', () => ({
  default: {
    roles: {
      auditor: { inherits: ['viewer'] },
      clerk: { inherits: ['membr'] },
      lead: { inherits: ['deputy'] },
      deputy: { inherits: ['lead'] },
    },
    grants: { clerk: ['users:delete'], lead: ['users:delete'], auditor: ['audit:read'] },
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
})

describe('a role table with a cycle and an unknown parent', () => {
  it('loads: the mistake is reported by the boot, not by an import', () => {
    expect(backends.BUILTIN_PERMISSIONS).toContain('audit:read')
  })

  it('stops installRuntimeBackends with a message naming the file and each role', () => {
    let message = ''
    try {
      backends.installRuntimeBackends()
    } catch (error) {
      message = (error as Error).message
    }

    expect(message).toContain('app/config/rbac.overrides.ts')
    expect(message).toContain('the role "clerk" inherits from "membr", which is not a role')
    expect(message).toContain('lead → deputy → lead')
    // The role that is sound is not named.
    expect(message).not.toContain('auditor')
  })

  it('installs nothing of it, so no role holds what the table would have given', () => {
    // The throw came before the configuration was installed.
    expect(runtime.tryGetRbacConfig()).toBeNull()
    for (const name of ['clerk', 'lead', 'deputy']) {
      expect(rbac.resolveRolePermissions(name as never), name).toEqual([])
      expect(rbac.resolveSubjectPermissions({ roles: [name] }), name).toEqual([])
    }
  })
})
