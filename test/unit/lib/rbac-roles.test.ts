import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vite-plus/test'

import {
  BUILTIN_ROLES,
  ROLE_DEFINITIONS,
  ROLE_HIERARCHY,
  assertRbacConfig,
  defineRbacOverrides,
  getAssignableRoles,
  getRoleDefinitions,
  hasPermission,
  isKnownRole,
  isRoleAtLeast,
  knownRoles,
  resolveRbacOverrides,
  resolveRolePermissions,
  roleLabel,
} from '@/lib/rbac'
import type {
  AppRoles,
  BuiltinRole,
  DefinesDeclaredRoles,
  Permission,
  ProjectRoles,
  RbacOverrides,
  Role,
  RoleOf,
} from '@/lib/rbac/types'
import { installRbacConfig } from '@/lib/runtime'

/**
 * A project's own roles, declared the way its permissions are.
 *
 * `AppRoles` is merged into for the whole program, tests included, so no test
 * declares a role through it: the seeded `rbac.overrides.ts` would then have to
 * define that role too. The types are generic over the declaration instead
 * (`RoleOf<Declared>`, `RbacOverrides<Declared>`), and that is what is asserted
 * here; `Role` is that same type applied to the program's `AppRoles`.
 */

/** What a project that declares two roles has. */
interface Declared {
  auditor: true
  billing_admin: true
}

const role = (name: string) => name as Role

/** Install a project's overrides, the way bootstrap does with the seeded file. */
function install(overrides: RbacOverrides<Declared>) {
  const config = resolveRbacOverrides<Declared>(overrides)
  installRbacConfig(config)
  return config
}

const TWO_ROLES: ProjectRoles<Declared> = {
  auditor: { inherits: ['viewer'] },
  billing_admin: { inherits: ['member', 'auditor'] },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Role, as a type', () => {
  it('is exactly the six built-in roles when a project declares none', () => {
    // oxlint-disable-next-line typescript/no-empty-object-type -- an empty declaration is the point
    expectTypeOf<RoleOf<{}>>().toEqualTypeOf<
      'super_admin' | 'admin' | 'manager' | 'member' | 'viewer' | 'guest'
    >()
    // oxlint-disable-next-line typescript/no-empty-object-type -- as above
    expectTypeOf<RoleOf<{}>>().toEqualTypeOf<BuiltinRole>()
  })

  it('is that rule applied to the AppRoles of the program', () => {
    expectTypeOf<Role>().toEqualTypeOf<RoleOf<AppRoles>>()
    expectTypeOf<BuiltinRole>().toExtend<Role>()
  })

  it('widens with what a project declares, and with nothing else', () => {
    expectTypeOf<RoleOf<Declared>>().toEqualTypeOf<BuiltinRole | 'auditor' | 'billing_admin'>()
    expectTypeOf<'auditor'>().toExtend<RoleOf<Declared>>()
    expectTypeOf<'auditer'>().not.toExtend<RoleOf<Declared>>()
    expectTypeOf<string>().not.toExtend<RoleOf<Declared>>()
  })

  it('accepts a declared role wherever a role is written, and refuses a typo', () => {
    const overrides = defineRbacOverrides<Declared>({
      roles: {
        auditor: { inherits: ['viewer'], label: 'Auditor' },
        billing_admin: { inherits: ['member', 'auditor'], assignable: false },
      },
      grants: { auditor: ['audit:read'], manager: ['billing:manage'] },
    })
    expect(Object.keys(overrides.roles ?? {})).toEqual(['auditor', 'billing_admin'])

    defineRbacOverrides<Declared>({
      roles: {
        // @ts-expect-error -- 'viewr' is not a role
        auditor: { inherits: ['viewr'] },
        billing_admin: { inherits: [] },
      },
    })
    defineRbacOverrides<Declared>({
      roles: TWO_ROLES,
      // @ts-expect-error -- 'auditer' is not a role
      grants: { auditer: ['audit:read'] },
    })
    defineRbacOverrides<Declared>({
      roles: {
        ...TWO_ROLES,
        // @ts-expect-error -- defined, never declared
        accountant: { inherits: ['viewer'] },
      },
    })
  })

  it('requires every declared role to be defined', () => {
    // @ts-expect-error -- `roles` is required once a role is declared
    defineRbacOverrides<Declared>({ grants: {} })
    defineRbacOverrides<Declared>({
      // @ts-expect-error -- billing_admin is declared and not defined
      roles: { auditor: { inherits: ['viewer'] } },
    })

    expectTypeOf<DefinesDeclaredRoles<Declared>>().toEqualTypeOf<{
      roles: ProjectRoles<Declared>
    }>()
  })

  it('asks nothing of a project that declares no role, and lets it define none', () => {
    // oxlint-disable-next-line typescript/no-empty-object-type -- an empty declaration is the point
    type None = {}
    expectTypeOf<DefinesDeclaredRoles<None>>().toEqualTypeOf<unknown>()

    expect(defineRbacOverrides<None>({})).toEqual({})
    expect(defineRbacOverrides<None>({ roles: {}, grants: {}, withdrawn: [] }).roles).toEqual({})
    defineRbacOverrides<None>({
      // @ts-expect-error -- not declared in AppRoles
      roles: { auditor: { inherits: ['viewer'] } },
    })
  })

  it('does not let a built-in role be redefined', () => {
    // A project that puts a built-in name in AppRoles declares nothing new.
    interface Shadowing {
      admin: true
      auditor: true
    }
    defineRbacOverrides<Shadowing>({
      roles: {
        auditor: { inherits: ['viewer'] },
        // @ts-expect-error -- the hierarchy of the built-in roles is fixed
        admin: { inherits: ['guest'] },
      },
    })
  })
})

describe('a project role', () => {
  it('holds what its parent holds, and what it is granted', () => {
    install({ roles: TWO_ROLES, grants: { auditor: ['audit:read'] } })

    expect(resolveRolePermissions(role('auditor'))).toEqual([
      ...resolveRolePermissions('viewer'),
      'audit:read',
    ])
    // Its grant is its own: nothing in the built-in hierarchy inherits from it.
    for (const builtin of ['viewer', 'member', 'manager'] as const) {
      expect(resolveRolePermissions(builtin), builtin).not.toContain('audit:read')
    }
    expect(hasPermission(role('auditor'), undefined, 'audit:read')).toBe(true)
    expect(hasPermission(role('auditor'), undefined, 'users:read')).toBe(false)
  })

  it('holds the union of several parents, built-in or the project’s', () => {
    install({ roles: TWO_ROLES, grants: { auditor: ['audit:read'] } })

    const held = new Set(resolveRolePermissions(role('billing_admin')))
    const expected = new Set([
      ...resolveRolePermissions('member'),
      ...resolveRolePermissions(role('auditor')),
    ])
    expect(held).toEqual(expected)
    expect(held.has('audit:read')).toBe(true)
    expect(held.has('users:read')).toBe(true)
    expect(held.has('billing:manage')).toBe(false)
  })

  it('receives what is granted to a role it inherits from, however far up', () => {
    install({ roles: TWO_ROLES, grants: { guest: ['billing:read'], viewer: ['billing:manage'] } })

    expect(resolveRolePermissions(role('auditor'))).toContain('billing:read')
    expect(resolveRolePermissions(role('auditor'))).toContain('billing:manage')
    expect(resolveRolePermissions(role('billing_admin'))).toContain('billing:manage')
  })

  it('loses what the project withdrew, like every role', () => {
    install({
      roles: TWO_ROLES,
      grants: { auditor: ['audit:read'] },
      withdrawn: ['audit:read', 'reports:read'],
    })

    const held = resolveRolePermissions(role('billing_admin'))
    expect(held).not.toContain('audit:read')
    expect(held).not.toContain('reports:read')
    expect(held).toContain('customers:read')
  })

  it('may inherit from nothing and hold only its grants', () => {
    installRbacConfig(
      resolveRbacOverrides<{ kiosk: true }>({
        roles: { kiosk: { inherits: [] } },
        grants: { kiosk: ['dashboard:read'] },
      }),
    )

    expect(resolveRolePermissions(role('kiosk'))).toEqual(['dashboard:read'])
    expect(isRoleAtLeast(role('kiosk'), 'guest')).toBe(false)
  })

  it('is at least the roles in its ancestry, and no other', () => {
    install({ roles: TWO_ROLES })
    const atLeast = (held: string) =>
      knownRoles().filter((required) => isRoleAtLeast(role(held), required))

    expect(atLeast('auditor')).toEqual(['viewer', 'guest', 'auditor'])
    expect(atLeast('billing_admin')).toEqual([
      'member',
      'viewer',
      'guest',
      'auditor',
      'billing_admin',
    ])
    // No built-in role is at least a project role: nothing inherits from it.
    expect(atLeast('super_admin')).toEqual([...BUILTIN_ROLES])
    expect(isRoleAtLeast('super_admin', role('auditor'))).toBe(false)
    expect(isRoleAtLeast(role('auditor'), 'member')).toBe(false)
  })

  it('leaves the built-in roles exactly as they were', () => {
    const before = Object.fromEntries(
      BUILTIN_ROLES.map((name) => [name, resolveRolePermissions(name, null)]),
    )
    install({ roles: TWO_ROLES, grants: { auditor: ['audit:read'] } })

    for (const name of BUILTIN_ROLES) expect(resolveRolePermissions(name)).toEqual(before[name])
    expect(ROLE_HIERARCHY).toEqual([...BUILTIN_ROLES])
    expect(Object.keys(ROLE_DEFINITIONS)).toEqual([...BUILTIN_ROLES])
  })

  it('is a role the app knows, after the built-in ones, in the order defined', () => {
    install({ roles: TWO_ROLES })

    expect(knownRoles()).toEqual([...BUILTIN_ROLES, 'auditor', 'billing_admin'])
    expect(isKnownRole('auditor')).toBe(true)
    expect(isKnownRole('auditer')).toBe(false)
    for (const hostile of ['__proto__', 'constructor', 'toString', '', 7, null, undefined, {}]) {
      expect(isKnownRole(hostile), JSON.stringify(hostile)).toBe(false)
    }
  })
})

describe('a role table that is wrong', () => {
  it('rejects a cycle, and every role on it holds nothing', () => {
    const config = resolveRbacOverrides<{ a: true; b: true; c: true }>({
      roles: { a: { inherits: ['viewer', 'b'] }, b: { inherits: ['c'] }, c: { inherits: ['a'] } },
      grants: { a: ['users:delete'], b: ['users:delete'], c: ['users:delete'] },
    })
    installRbacConfig(config)

    expect(config.roles).toBeUndefined()
    expect(config.problems).toHaveLength(1)
    expect(config.problems![0]).toContain('a → b → c → a')
    for (const name of ['a', 'b', 'c']) {
      expect(resolveRolePermissions(role(name)), name).toEqual([])
      expect(isKnownRole(name), name).toBe(false)
      expect(isRoleAtLeast(role(name), 'guest'), name).toBe(false)
    }
  })

  it('rejects a role that inherits from itself', () => {
    const config = resolveRbacOverrides<{ loop: true }>({ roles: { loop: { inherits: ['loop'] } } })

    expect(config.roles).toBeUndefined()
    expect(config.problems).toEqual([expect.stringContaining('loop → loop')])
  })

  it('rejects a parent that is not a role, and keeps the roles that are sound', () => {
    const config = resolveRbacOverrides<{ auditor: true; clerk: true }>({
      roles: {
        auditor: { inherits: ['viewer'] },
        // The mistake a type error would have caught, had it not been cast away.
        clerk: { inherits: ['membr' as Role] },
      },
      grants: { clerk: ['users:delete'] },
    })
    installRbacConfig(config)

    expect([...config.roles!.keys()]).toEqual(['auditor'])
    expect(config.problems).toEqual([
      expect.stringContaining('the role "clerk" inherits from "membr"'),
    ])
    expect(resolveRolePermissions(role('clerk'))).toEqual([])
    expect(resolveRolePermissions(role('auditor'))).toEqual(resolveRolePermissions('viewer'))
  })

  it('rejects a role that inherits from a rejected one, rather than give it less than it says', () => {
    const config = resolveRbacOverrides<{ clerk: true; lead: true }>({
      roles: {
        lead: { inherits: ['member', 'clerk'] },
        clerk: { inherits: ['nobody' as Role] },
      },
    })

    expect(config.roles).toBeUndefined()
    expect(config.problems).toEqual([
      expect.stringContaining('the role "clerk" inherits from "nobody"'),
      expect.stringContaining('the role "lead" inherits from a role that is not usable'),
    ])
  })

  it('does not let a built-in role be redefined at runtime either', () => {
    const before = resolveRolePermissions('viewer', null)
    const config = resolveRbacOverrides({
      roles: { viewer: { inherits: ['super_admin'] } } as never,
    })
    installRbacConfig(config)

    expect(config.roles).toBeUndefined()
    expect(config.problems).toEqual([expect.stringContaining('"viewer" is a built-in role')])
    expect(resolveRolePermissions('viewer')).toEqual(before)
  })

  it('survives definitions that are not what the types say', () => {
    const config = resolveRbacOverrides({
      roles: {
        nothing: null,
        text: 'viewer',
        wrongParents: { inherits: 'viewer' },
        oddParent: { inherits: [{ name: 'viewer' }] },
        noParents: {},
      } as never,
    })

    // A role with no `inherits` at all inherits nothing; the rest are refused.
    expect([...config.roles!.keys()]).toEqual(['noParents'])
    expect(config.roles!.get('noParents')!.includes).toEqual(['noParents'])
    expect(config.problems).toHaveLength(4)
    expect(resolveRbacOverrides({ roles: 'auditor' as never })).toEqual({
      grants: {},
      withdrawn: [],
    })
  })

  it('stops the boot with a message that names the file and every mistake', () => {
    const config = resolveRbacOverrides<{ a: true; clerk: true }>({
      roles: { a: { inherits: ['a'] }, clerk: { inherits: ['membr' as Role] } },
    })

    expect(() => assertRbacConfig(config)).toThrow(/app\/config\/rbac\.overrides\.ts/)
    expect(() => assertRbacConfig(config)).toThrow(/\(1\).*"a".*\(2\).*"clerk"/s)
    expect(() => assertRbacConfig(resolveRbacOverrides({}))).not.toThrow()
    expect(() =>
      assertRbacConfig(resolveRbacOverrides<Declared>({ roles: TWO_ROLES })),
    ).not.toThrow()
  })
})

describe('the configuration with no role defined', () => {
  it('carries neither a role table nor a problem list', () => {
    for (const config of [
      resolveRbacOverrides(),
      resolveRbacOverrides({}),
      resolveRbacOverrides({ roles: {} }),
      resolveRbacOverrides({ grants: { viewer: ['billing:read'] }, withdrawn: ['users:delete'] }),
    ]) {
      expect('roles' in config).toBe(false)
      expect('problems' in config).toBe(false)
    }
  })
})

describe('getRoleDefinitions', () => {
  it('describes the built-in roles alone when the project defines none', () => {
    installRbacConfig(resolveRbacOverrides({}))
    const definitions = getRoleDefinitions()

    expect(definitions.map((definition) => definition.name)).toEqual([...BUILTIN_ROLES])
    for (const definition of definitions) {
      const legacy = ROLE_DEFINITIONS[definition.name as BuiltinRole]
      expect(definition.label).toBe(legacy.label)
      expect(definition.description).toBe(legacy.description)
      expect(definition.permissions).toEqual(legacy.permissions)
      expect(definition.labelKey).toBe(`role_${definition.name}`)
      expect(definition.builtin).toBe(true)
      expect(definition.assignable).toBe(true)
    }
    expect(definitions.map((definition) => definition.inherits)).toEqual([
      ['admin'],
      ['manager'],
      ['member'],
      ['viewer'],
      ['guest'],
      [],
    ])
    expect(getAssignableRoles().map((definition) => definition.name)).toEqual([...BUILTIN_ROLES])
  })

  it('lists the project’s roles after them, with their labels and what they hold', () => {
    install({
      roles: {
        auditor: {
          inherits: ['viewer'],
          label: 'Auditor',
          labelKey: 'roles.auditor',
          description: 'Reads everything, changes nothing',
        },
        billing_admin: { inherits: ['member', 'auditor'], assignable: false },
      },
      grants: { auditor: ['audit:read'] },
    })

    const [auditor, billing] = getRoleDefinitions().slice(BUILTIN_ROLES.length)
    expect(auditor).toMatchObject({
      name: 'auditor',
      label: 'Auditor',
      labelKey: 'roles.auditor',
      description: 'Reads everything, changes nothing',
      builtin: false,
      inherits: ['viewer'],
      assignable: true,
    })
    expect(auditor!.permissions).toEqual(resolveRolePermissions(role('auditor')))
    // No label given: the key the built-in roles use, and the name made readable.
    expect(billing).toMatchObject({
      name: 'billing_admin',
      label: 'Billing admin',
      labelKey: 'role_billing_admin',
      description: '',
      assignable: false,
    })
    expect(getAssignableRoles().map((definition) => definition.name)).toEqual([
      ...BUILTIN_ROLES,
      'auditor',
    ])
  })

  it('reads what a role holds when asked, not when it was listed', () => {
    install({ roles: TWO_ROLES })
    const auditor = getRoleDefinitions().find((definition) => definition.name === role('auditor'))!
    expect(auditor.permissions).not.toContain('audit:read')

    install({ roles: TWO_ROLES, grants: { auditor: ['audit:read'] } })
    expect(auditor.permissions).toContain('audit:read')
  })
})

describe('roleLabel', () => {
  const catalog: Record<string, string> = {
    role_admin: 'Admin',
    'roles.auditor': 'Auditrice',
  }
  const i18n = {
    t: (key: string) => catalog[key] ?? key,
    te: (key: string) => key in catalog,
  }

  it('prefers the translation, then the plain label, then the name made readable', () => {
    install({
      roles: {
        auditor: { inherits: ['viewer'], labelKey: 'roles.auditor', label: 'Auditor' },
        billing_admin: { inherits: ['member'] },
      },
    })

    expect(roleLabel('admin', i18n)).toBe('Admin')
    expect(roleLabel('auditor', i18n)).toBe('Auditrice')
    expect(roleLabel('billing_admin', i18n)).toBe('Billing admin')

    catalog.role_billing_admin = 'Administrateur de facturation'
    expect(roleLabel('billing_admin', i18n)).toBe('Administrateur de facturation')
    delete catalog.role_billing_admin
  })

  it('falls back to the plain label of a role whose key no locale has', () => {
    install({ roles: { ...TWO_ROLES, auditor: { inherits: ['viewer'], label: 'Auditor' } } })
    expect(roleLabel('auditor', i18n)).toBe('Auditor')
  })

  it('names a role the app does not have as it always did: through the catalog', () => {
    installRbacConfig(resolveRbacOverrides({}))
    expect(roleLabel('mystery', i18n)).toBe('role_mystery')
  })
})

describe('permissions granted to a project role alone', () => {
  it('are held by that role and by no built-in one', () => {
    install({ roles: TWO_ROLES, grants: { auditor: ['audit:read'] } })
    const holders = knownRoles().filter((name) =>
      resolveRolePermissions(name).includes('audit:read' as Permission),
    )

    // admin and super_admin hold it from the template; auditor and what
    // inherits from it hold it from the grant.
    expect(holders).toEqual(['super_admin', 'admin', 'auditor', 'billing_admin'])
  })
})

describe('what the e2e helpers can load without a bundler', () => {
  // `e2e/helpers/auth.ts` imports `inheritance.ts` straight into Node, to give
  // a test user what a role holds. There `import.meta.env` is undefined, so a
  // module that reads it while loading (the logger does) cannot be in the graph.
  it('inheritance.ts and role-graph.ts import the runtime slots and types, and nothing else', async () => {
    const fs = await import('node:fs')
    const imports = (file: string) =>
      [...fs.readFileSync(`src/modules/core/lib/rbac/${file}`, 'utf8').matchAll(/from '([^']+)'/g)]
        .map((match) => match[1] ?? '')
        .toSorted((a, b) => a.localeCompare(b))

    expect(imports('role-graph.ts')).toEqual(['./types', '~/lib/runtime'])
    expect(imports('inheritance.ts')).toEqual(['./role-graph', './types', '~/lib/runtime'])
  })
})
