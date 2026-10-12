import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { createApp, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useModuleNav } from '@/composables/useModuleNav'
import { RBAC_USER_SOURCE_KEY, useRbac } from '@/composables/useRbac'
import { resolveRouteAccess, type GuardSubject } from '@/plugins/route-guard'
import { useAuthStore } from '@/stores/auth'
import { knownRoles, resolveRolePermissions } from '~/lib/rbac'
import { resolveRbacOverrides } from '~/lib/rbac/overrides'
import type { RbacOverrides } from '~/lib/rbac/types'
import { installRbacConfig } from '~/lib/runtime'
import { useModuleStore } from '~/modules'
import type { ModuleDefinition } from '~/modules/types'
import type { Permission, Role, User } from '~/types'

import { createUser } from '../../fixtures'
import { captureLogged } from '../../utils/logged'

/**
 * The route guard, `useRbac` and the sidebar, for a user with several roles and
 * for a user whose role is the project's own.
 *
 * `rbac-parity.test.ts` holds the same three surfaces to one answer for the
 * single-role shapes. These are the shapes the roles seam adds, and the second
 * half is the role question (`requiredRole`, `isAtLeast`), which a list of
 * roles can get wrong in a way a permission set cannot: by asking the primary
 * role alone.
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

const roles = (...names: string[]) => names as Role[]
const sorted = (values: Iterable<string>) => [...values].sort()

/** Every permission any role holds once the project's roles are installed. */
const probes = (): Permission[] => [
  ...new Set(knownRoles().flatMap((role) => resolveRolePermissions(role))),
]

function navModule(permissions: Permission[]): ModuleDefinition {
  return {
    config: {
      id: 'parity',
      name: 'parity',
      description: '',
      version: '1.0.0',
      category: 'content',
    },
    navItems: permissions.map((permission) => ({
      label: permission,
      icon: 'file',
      to: `/${permission}`,
      permission,
      group: 'overview',
    })),
  }
}

/** The subject exactly as `plugins/router.ts` hands it to the guard. */
function guardSubject(): GuardSubject {
  const auth = useAuthStore()
  return {
    isAuthenticated: auth.isAuthenticated,
    role: auth.userRole,
    roles: auth.userRoles,
    permissions: auth.userPermissions as Permission[] | undefined,
  }
}

/** What each surface grants the user currently in the store. */
async function surfaces() {
  const all = probes()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: {} }],
  })
  const app = createApp({ render: () => null })
  app.use(router)

  const moduleStore = useModuleStore()
  moduleStore.registerModule(navModule(all))
  await moduleStore.enableModule('parity')

  const rbac = app.runWithContext(() => useRbac())
  const { groups } = app.runWithContext(() => useModuleNav())
  const subject = guardSubject()

  return {
    guard: all.filter(
      (permission) =>
        resolveRouteAccess(
          { fullPath: `/${permission}`, meta: { requiredPermission: permission } },
          subject,
        ).type === 'allow',
    ),
    rbac: all.filter((permission) => rbac.can(permission)),
    nav: groups.value.flatMap((group) => group.items.map((item) => item.label)),
  }
}

function signIn(overrides: Partial<User>) {
  useAuthStore().setAuth(createUser(overrides), 'access-token')
}

let logged: ReturnType<typeof captureLogged>

beforeEach(() => {
  setActivePinia(createPinia())
  installRbacConfig(resolveRbacOverrides<Declared>(PROJECT))
  logged = captureLogged()
})

afterEach(() => {
  logged.restore()
})

describe('guard, useRbac and sidebar agree for the users the roles seam adds', () => {
  const union =
    (...names: string[]) =>
    () => [...new Set(roles(...names).flatMap((role) => resolveRolePermissions(role)))]

  const rows: Array<{
    name: string
    user: Partial<User>
    expected: () => readonly string[]
  }> = [
    {
      name: 'a project role',
      user: { role: 'auditor' as Role },
      expected: union('auditor'),
    },
    {
      name: 'two built-in roles, one inheriting from the other',
      user: { role: 'viewer', roles: roles('viewer', 'manager') },
      expected: union('manager'),
    },
    {
      name: 'a built-in role and a project role, neither above the other',
      user: { role: 'manager', roles: roles('manager', 'auditor') },
      expected: union('manager', 'auditor'),
    },
    {
      name: 'two project roles and no `role`',
      user: { role: undefined as unknown as Role, roles: roles('auditor', 'billing_admin') },
      expected: union('auditor', 'billing_admin'),
    },
    {
      name: 'a `role` the app does not have beside roles it does',
      user: { role: 'owner' as Role, roles: roles('billing_admin', 'root') },
      expected: union('billing_admin'),
    },
    {
      name: 'several roles and an explicit permission set, which still wins',
      user: { role: 'admin', roles: roles('admin', 'auditor'), permissions: ['users:read'] },
      expected: () => ['users:read'],
    },
    {
      name: 'only roles the app does not have',
      user: { role: 'owner' as Role, roles: roles('root', 'wheel') },
      expected: () => [],
    },
    {
      name: 'a `roles` that is not a list of names, beside a role',
      user: { role: 'viewer', roles: { admin: true } as unknown as Role[] },
      expected: union('viewer'),
    },
  ]

  it.each(rows)('$name', async ({ user, expected }) => {
    signIn(user)

    const { guard, rbac, nav } = await surfaces()
    const want = sorted(expected())

    expect(sorted(guard)).toEqual(want)
    expect(sorted(rbac)).toEqual(want)
    expect(sorted(nav)).toEqual(want)
    expect(sorted(useAuthStore().userPermissions)).toEqual(want)
  })
})

describe('the role question gets one answer too', () => {
  /** The roles `requiredRole` admits, and the ones `isAtLeast` says yes to. */
  function roleAnswers() {
    const app = createApp({ render: () => null })
    const rbac = app.runWithContext(() => useRbac())
    const subject = guardSubject()

    return {
      guard: knownRoles().filter(
        (requiredRole) =>
          resolveRouteAccess({ fullPath: '/r', meta: { requiredRole } }, subject).type === 'allow',
      ),
      rbac: knownRoles().filter((required) => rbac.isAtLeast(required)),
    }
  }

  const cases: Array<{ name: string; user: Partial<User>; atLeast: string[] }> = [
    {
      name: 'a project role is at least what it inherits from',
      user: { role: 'auditor' as Role },
      atLeast: ['viewer', 'guest', 'auditor'],
    },
    {
      name: 'a second role counts, though the primary one is lower',
      user: { role: 'viewer', roles: roles('viewer', 'manager') },
      atLeast: ['manager', 'member', 'viewer', 'guest'],
    },
    {
      name: 'a second role counts when it is the project’s',
      user: { role: 'guest', roles: roles('guest', 'billing_admin') },
      atLeast: ['member', 'viewer', 'guest', 'billing_admin'],
    },
    {
      name: 'roles with no `role` at all',
      user: { role: undefined as unknown as Role, roles: roles('auditor', 'manager') },
      atLeast: ['manager', 'member', 'viewer', 'guest', 'auditor'],
    },
    {
      name: 'a user with no role the app has is at least nothing',
      user: { role: 'owner' as Role, roles: roles('root') },
      atLeast: [],
    },
  ]

  it.each(cases)('$name', ({ user, atLeast }) => {
    signIn(user)

    const { guard, rbac } = roleAnswers()

    expect(guard).toEqual(atLeast)
    expect(rbac).toEqual(atLeast)
  })

  it('judges the primary role alone when the caller passes no list, as before', () => {
    signIn({ role: 'viewer', roles: roles('viewer', 'manager') })
    const { roles: _dropped, ...withoutRoles } = guardSubject()

    // A router plugin written for 1.0 passes `role` and nothing else: it is
    // stricter than the user's roles allow, never looser.
    expect(
      resolveRouteAccess({ fullPath: '/r', meta: { requiredRole: 'manager' } }, withoutRoles).type,
    ).toBe('forbidden')
    expect(
      resolveRouteAccess({ fullPath: '/r', meta: { requiredRole: 'viewer' } }, withoutRoles).type,
    ).toBe('allow')
  })
})

describe('the auth store, for a user with several roles', () => {
  it('lists the roles the app has, and reads the primary one as the role', () => {
    const auth = useAuthStore()

    signIn({ role: 'viewer', roles: roles('viewer', 'auditor', 'root') })
    expect(auth.userRoles).toEqual(['viewer', 'auditor'])
    expect(auth.userRole).toBe('viewer')

    signIn({ role: undefined as unknown as Role, roles: roles('guest', 'billing_admin') })
    expect(auth.userRoles).toEqual(['guest', 'billing_admin'])
    expect(auth.userRole).toBe('billing_admin')

    auth.clearAuth()
    expect(auth.userRoles).toEqual([])
    expect(auth.userRole).toBe('guest')
  })
})

describe('useRbac, for a user with several roles', () => {
  const mount = () => createApp({ render: () => null }).runWithContext(() => useRbac())

  it('exposes every role, and says which the user was given', () => {
    signIn({ role: 'manager', roles: roles('manager', 'auditor') })
    const rbac = mount()

    expect(rbac.role.value).toBe('manager')
    expect(rbac.roles.value).toEqual(['manager', 'auditor'])
    expect(rbac.hasRole('auditor' as Role)).toBe(true)
    expect(rbac.hasRole('manager')).toBe(true)
    // Inherited, not given: `isAtLeast` is the question for that.
    expect(rbac.hasRole('viewer')).toBe(false)
    expect(rbac.isAtLeast('viewer')).toBe(true)
    expect(rbac.can('audit:read')).toBe(true)
    expect(rbac.can('customers:manage')).toBe(true)
  })

  it('follows the store when the user changes', () => {
    signIn({ role: 'viewer' })
    const rbac = mount()
    expect(rbac.roles.value).toEqual(['viewer'])
    expect(rbac.isAtLeast('member')).toBe(false)

    signIn({ role: 'viewer', roles: roles('viewer', 'billing_admin') })
    expect(rbac.roles.value).toEqual(['viewer', 'billing_admin'])
    expect(rbac.isAtLeast('member')).toBe(true)
    expect(rbac.hasRole('billing_admin' as Role)).toBe(true)
  })

  it('reads a source that gives roles, and one written for a single role', () => {
    const app = createApp({ render: () => null })
    app.provide(RBAC_USER_SOURCE_KEY, {
      role: ref<Role>('viewer'),
      roles: ref(roles('viewer', 'auditor')),
      permissions: ref<string[]>([...resolveRolePermissions('auditor' as Role)]),
    })
    const many = app.runWithContext(() => useRbac())
    expect(many.roles.value).toEqual(['viewer', 'auditor'])
    expect(many.hasRole('auditor' as Role)).toBe(true)
    expect(many.isAtLeast('auditor' as Role)).toBe(true)

    const single = useRbac({ role: ref<Role>('manager'), permissions: ref<string[]>([]) })
    expect(single.roles.value).toEqual(['manager'])
    expect(single.isAtLeast('member')).toBe(true)
    expect(single.isAtLeast('admin')).toBe(false)
    expect(single.hasRole('manager')).toBe(true)
  })
})
