import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  anyRoleAtLeast,
  resolvePrimaryRole,
  resolveRbacOverrides,
  resolveRolePermissions,
  resolveSubjectPermissions,
  resolveSubjectRoles,
} from '@/lib/rbac'
import type { PermissionSubject } from '@/lib/rbac'
import type { Permission, RbacOverrides, Role } from '@/lib/rbac/types'
import { installRbacConfig } from '@/lib/runtime'

import { captureLogged } from '../../utils/logged'

/**
 * A user with more than one role, and a user with a role the app has never
 * heard of.
 */

interface Declared {
  auditor: true
  billing_admin: true
}

const PROJECT: RbacOverrides<Declared> = {
  roles: {
    auditor: { inherits: ['viewer'] },
    billing_admin: { inherits: ['member'] },
  },
  grants: { auditor: ['audit:read'], billing_admin: ['billing:manage'] },
}

const role = (name: string) => name as Role
const roles = (...names: string[]) => names as Role[]
const sorted = (values: readonly string[]) => [...values].sort()

function installProject(overrides: RbacOverrides<Declared> = PROJECT) {
  installRbacConfig(resolveRbacOverrides<Declared>(overrides))
}

// Every test here hands the RBAC layer names it does not know, and each one is
// reported: held back from the output, and read by the tests that assert it.
let logged: ReturnType<typeof captureLogged>

beforeEach(() => {
  logged = captureLogged()
})

afterEach(() => {
  logged.restore()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('the roles of a user', () => {
  it('are `role` first, then `roles` in the order sent, each once', () => {
    installProject()

    expect(resolveSubjectRoles({ role: 'member' })).toEqual(['member'])
    expect(resolveSubjectRoles({ roles: roles('viewer', 'auditor') })).toEqual([
      'viewer',
      'auditor',
    ])
    expect(
      resolveSubjectRoles({ role: 'manager', roles: roles('auditor', 'manager', 'auditor') }),
    ).toEqual(['manager', 'auditor'])
  })

  it('are none for nobody, and for a user with no role', () => {
    expect(resolveSubjectRoles(null)).toEqual([])
    expect(resolveSubjectRoles(undefined)).toEqual([])
    expect(resolveSubjectRoles({})).toEqual([])
    expect(resolveSubjectRoles({ role: null, roles: null })).toEqual([])
    expect(resolveSubjectRoles({ role: '' as Role, roles: [] })).toEqual([])
  })

  it('never include a name the app does not declare', () => {
    installProject()

    expect(resolveSubjectRoles({ role: role('mystery') })).toEqual([])
    expect(
      resolveSubjectRoles({ role: role('owner'), roles: roles('auditor', 'root', 'viewer') }),
    ).toEqual(['auditor', 'viewer'])
    // A project role is one only while the project defines it.
    installRbacConfig(resolveRbacOverrides({}))
    expect(resolveSubjectRoles({ roles: roles('auditor', 'viewer') })).toEqual(['viewer'])
  })

  it('read nothing from a `roles` that is not an array of names', () => {
    installProject()
    const hostile: unknown[] = [
      'admin',
      { 0: 'admin', length: 1 },
      { admin: true },
      new Set(['admin']),
      42,
      true,
      () => ['admin'],
    ]

    for (const value of hostile) {
      expect(resolveSubjectRoles({ role: 'guest', roles: value }), typeof value).toEqual(['guest'])
      expect(resolveSubjectPermissions({ role: 'guest', roles: value })).toEqual(
        resolveRolePermissions('guest'),
      )
    }
  })

  it('skip the members of `roles` that are not names, and names that reach for a prototype', () => {
    installProject()
    const mixed: unknown[] = [
      null,
      undefined,
      7,
      ['admin'],
      { name: 'admin' },
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      'viewer',
    ]

    expect(resolveSubjectRoles({ roles: mixed })).toEqual(['viewer'])
    expect(resolveSubjectPermissions({ roles: mixed })).toEqual(resolveRolePermissions('viewer'))
    expect(resolvePrimaryRole({ roles: mixed })).toBe('viewer')
  })

  it('do not read past a few hundred names', () => {
    const huge = Array.from({ length: 100_000 }, (_, index) => `role-${index}`)
    huge.push('super_admin')

    // The real role sits past the limit: it is not read, and nothing is granted.
    expect(resolveSubjectRoles({ roles: huge })).toEqual([])
    expect(resolveSubjectPermissions({ roles: huge })).toEqual([])
    expect(resolveSubjectRoles({ roles: ['super_admin', ...huge] })).toEqual(['super_admin'])
  })
})

describe('what a user with several roles holds', () => {
  it('is the union of what each role holds', () => {
    installProject()
    const held = resolveSubjectPermissions({ roles: roles('auditor', 'billing_admin') })

    expect(sorted(held)).toEqual(
      sorted([
        ...new Set([
          ...resolveRolePermissions(role('auditor')),
          ...resolveRolePermissions(role('billing_admin')),
        ]),
      ]),
    )
    expect(held).toContain('audit:read')
    expect(held).toContain('billing:manage')
    expect(new Set(held).size).toBe(held.length)
  })

  it('counts `role` and `roles` together', () => {
    installProject()

    expect(
      sorted(resolveSubjectPermissions({ role: 'viewer', roles: roles('billing_admin') })),
    ).toEqual(sorted(resolveRolePermissions(role('billing_admin'))))
    expect(resolveSubjectPermissions({ role: 'viewer', roles: roles('auditor') })).toContain(
      'audit:read',
    )
  })

  it('is exactly what the one role holds when there is one, wherever it was written', () => {
    for (const subject of [
      { role: 'manager' },
      { roles: ['manager'] },
      { role: 'manager', roles: ['manager'] },
    ] as PermissionSubject[]) {
      expect(resolveSubjectPermissions(subject)).toEqual(resolveRolePermissions('manager'))
    }
  })

  it('is nothing when none of the roles is one the app has', () => {
    expect(resolveSubjectPermissions({ roles: roles('owner', 'root') })).toEqual([])
    expect(resolveSubjectPermissions({ role: role('owner'), roles: roles('root') })).toEqual([])
  })

  it('is the explicit set when the backend sent one, however many roles there are', () => {
    installProject()

    expect(
      resolveSubjectPermissions({
        roles: roles('admin', 'billing_admin'),
        permissions: ['users:read'],
      }),
    ).toEqual(['users:read'])
    expect(resolveSubjectPermissions({ roles: roles('super_admin'), permissions: [] })).toEqual([])
  })

  it('loses what the project withdrew, from an explicit set too', () => {
    installProject({ ...PROJECT, withdrawn: ['orders:read', 'audit:read'] })

    expect(
      resolveSubjectPermissions({
        role: 'viewer',
        permissions: ['orders:read', 'users:read', 'audit:read'],
      }),
    ).toEqual(['users:read'])
    const held = resolveSubjectPermissions({ roles: roles('auditor', 'manager') })
    expect(held).not.toContain('orders:read')
    expect(held).not.toContain('audit:read')
    expect(held).toContain('orders:manage')
  })

  it('leaves a permission string the app does not declare in an explicit set, as sent', () => {
    // Nothing asks for it, so it grants nothing; and it is what the app did
    // before roles could be declared.
    expect(
      resolveSubjectPermissions({
        role: 'guest',
        permissions: ['users:read', 'made-up:thing' as Permission],
      }),
    ).toEqual(['users:read', 'made-up:thing'])
  })
})

describe('the primary role', () => {
  it('is `role` when the app has it, whatever `roles` holds', () => {
    installProject()

    expect(resolvePrimaryRole({ role: 'viewer' })).toBe('viewer')
    expect(resolvePrimaryRole({ role: 'viewer', roles: roles('super_admin', 'auditor') })).toBe(
      'viewer',
    )
  })

  it('is the only role when there is one', () => {
    expect(resolvePrimaryRole({ roles: ['member'] })).toBe('member')
  })

  it('is the first of `roles` that no other of them inherits from', () => {
    installProject()

    // An admin is a viewer already.
    expect(resolvePrimaryRole({ roles: roles('viewer', 'admin') })).toBe('admin')
    expect(resolvePrimaryRole({ roles: roles('guest', 'viewer', 'auditor') })).toBe('auditor')
    // Neither inherits from the other: the order the backend chose decides.
    expect(resolvePrimaryRole({ roles: roles('auditor', 'billing_admin') })).toBe('auditor')
    expect(resolvePrimaryRole({ roles: roles('billing_admin', 'auditor') })).toBe('billing_admin')
    // billing_admin is a member, so member is not it.
    expect(resolvePrimaryRole({ roles: roles('member', 'billing_admin', 'auditor') })).toBe(
      'billing_admin',
    )
  })

  it('is derived from `roles` when `role` is one the app does not have', () => {
    expect(resolvePrimaryRole({ role: role('owner'), roles: roles('viewer', 'manager') })).toBe(
      'manager',
    )
  })

  it('is none when the user holds no role the app has', () => {
    expect(resolvePrimaryRole(null)).toBeUndefined()
    expect(resolvePrimaryRole({})).toBeUndefined()
    expect(resolvePrimaryRole({ role: role('owner') })).toBeUndefined()
    expect(resolvePrimaryRole({ roles: roles('owner', 'root') })).toBeUndefined()
  })
})

describe('anyRoleAtLeast', () => {
  it('is met by any one of the roles', () => {
    installProject()

    expect(anyRoleAtLeast(roles('auditor', 'manager'), 'manager')).toBe(true)
    expect(anyRoleAtLeast(roles('auditor', 'manager'), 'member')).toBe(true)
    expect(anyRoleAtLeast(roles('auditor', 'manager'), role('auditor'))).toBe(true)
    expect(anyRoleAtLeast(roles('auditor', 'manager'), 'admin')).toBe(false)
    expect(anyRoleAtLeast(roles('auditor', 'manager'), role('billing_admin'))).toBe(false)
    expect(anyRoleAtLeast([], 'guest')).toBe(false)
    expect(anyRoleAtLeast(roles('owner'), 'guest')).toBe(false)
  })
})

describe('a name the app does not declare', () => {
  it('is reported once in development, by name, and says nothing of whose it was', () => {
    const subject = {
      id: 'user-4711',
      email: 'someone@example.test',
      role: role('owner'),
      roles: roles('owner', 'root', 'viewer'),
    }

    resolveSubjectRoles(subject)
    resolveSubjectPermissions(subject)
    resolvePrimaryRole(subject)
    resolveSubjectRoles({ roles: roles('root') })
    const warnings = logged.warnings()

    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('Ignored the role "owner"')
    expect(warnings[1]).toContain('Ignored the role "root"')
    for (const line of warnings) {
      expect(line).toContain('rbac.overrides.ts')
      expect(line).not.toContain('user-4711')
      expect(line).not.toContain('someone@example.test')
    }
  })

  it('is reported by type when it is not a name, and cut short when it is long', () => {
    resolveSubjectRoles({ roles: [{ name: 'admin', secret: 'do-not-log' }, 'x'.repeat(5000)] })
    const warnings = logged.warnings()

    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('Ignored the role of type object')
    expect(warnings[0]).not.toContain('do-not-log')
    expect(warnings[1]!.length).toBeLessThan(400)
  })

  it('stops being reported after a hundred different names', () => {
    resolveSubjectRoles({ roles: Array.from({ length: 250 }, (_, index) => `role-${index}`) })
    const warnings = logged.warnings()

    expect(warnings).toHaveLength(100)
  })

  it('is dropped without a word in production', () => {
    vi.stubEnv('DEV', false)
    expect(resolveSubjectRoles({ role: role('owner'), roles: roles('viewer') })).toEqual(['viewer'])
    const warnings = logged.warnings()

    expect(warnings).toEqual([])
  })
})
