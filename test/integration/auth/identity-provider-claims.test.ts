import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test'

import { defineAuthConfig, installAuthConfig, resolveAuthConfig, type AuthConfig } from '@/lib/auth'
import { resolveRolePermissions } from '@/lib/rbac'
import { applyIdentity, identityMappers } from '@/lib/rbac/identity-mappers'
import { resolveRbacOverrides } from '@/lib/rbac/overrides'
import type { Role } from '@/lib/rbac/types'
import { installRbacConfig } from '@/lib/runtime'
import { createAuthAdapter } from '@/modules/auth'
import { resolveRouteAccess } from '@/plugins/route-guard'
import { useAuthStore } from '@/stores/auth'
import type { Permission } from '@/types'

import { captureLogged } from '../../utils/logged'

/**
 * A backend that describes its users the way its identity provider does.
 *
 * It signs users in against Keycloak and answers `/auth/login` and `/auth/me`
 * with the provider's claims: no `role`, no `permissions`, but
 * `realm_access.roles` and `resource_access`. The project says how to read
 * that in the two files it owns, `auth.config.ts` and `rbac.overrides.ts`, and
 * nothing else is touched.
 *
 * Driven end to end: the real jwt adapter, the real API client and the real
 * auth store, with msw as the backend.
 */

const server = setupServer()

const configure = (config: AuthConfig = {}) => installAuthConfig(resolveAuthConfig(config))

/** What the project writes in `app/config/rbac.overrides.ts`. */
const rbacOverrides = {
  roles: { auditor: { inherits: ['viewer'] } },
  grants: { auditor: ['audit:read'] },
} as const

/** What the project writes in `app/config/auth.config.ts`. */
const identity = identityMappers.keycloak({
  clientId: 'acme-web',
  roleMap: { 'team-lead': 'manager' },
})
const authConfig = defineAuthConfig({
  mapUser: (raw) => {
    const claims = raw as { sub: string; email: string; name?: string }
    return applyIdentity({ id: claims.sub, email: claims.email, name: claims.name }, identity(raw))
  },
})

interface Claims {
  sub: string
  email: string
  name?: string
  realm_access?: unknown
  resource_access?: unknown
  [claim: string]: unknown
}

const ada: Claims = {
  sub: '9f0c2b1a-0000-4000-8000-000000000002',
  email: 'ada@example.test',
  name: 'Ada Lovelace',
  realm_access: { roles: ['offline_access', 'uma_authorization', 'team-lead'] },
  resource_access: {
    'acme-web': { roles: ['auditor'] },
    account: { roles: ['manage-account', 'view-profile'] },
  },
}

/** The backend answers every sign-in with `claims`. */
function backend(claims: Claims) {
  server.use(
    http.post('*/api/auth/login', () =>
      HttpResponse.json({
        token: 'access-1',
        refreshToken: 'refresh-1',
        expiresIn: 900,
        user: claims,
      }),
    ),
    http.get('*/api/auth/me', () => HttpResponse.json(claims)),
  )
}

async function signIn() {
  const store = useAuthStore()
  const result = await createAuthAdapter('jwt').login({ email: 'ada@example.test', password: 'pw' })
  store.setAuth(result.user, result.token, result.refreshToken, result.expiresIn)
  return store
}

/** The subject exactly as `plugins/router.ts` hands it to the guard. */
function guardSubject() {
  const auth = useAuthStore()
  return {
    isAuthenticated: auth.isAuthenticated,
    role: auth.userRole,
    roles: auth.userRoles,
    permissions: auth.userPermissions as Permission[] | undefined,
  }
}

const opens = (meta: { requiredRole?: Role; requiredPermission?: Permission }) =>
  resolveRouteAccess({ fullPath: '/x', meta: { requiresAuth: true, ...meta } }, guardSubject()).type

let logged: ReturnType<typeof captureLogged>

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  installRbacConfig(resolveRbacOverrides<{ auditor: true }>(rbacOverrides))
  configure(authConfig)
  logged = captureLogged()
})
afterEach(() => {
  logged.restore()
  server.resetHandlers()
  useAuthStore().reset()
  configure()
})
afterAll(() => server.close())

describe('a backend that answers with identity-provider claims', () => {
  it('signs the user in with the app roles the claims amount to', async () => {
    backend(ada)

    const store = await signIn()

    expect(store.user).toEqual({
      id: ada.sub,
      email: ada.email,
      name: ada.name,
      role: 'manager',
      roles: ['manager', 'auditor'],
    })
    expect(store.userRole).toBe('manager')
    expect(store.userRoles).toEqual(['manager', 'auditor'])
    expect(new Set(store.userPermissions)).toEqual(
      new Set([...resolveRolePermissions('manager'), 'audit:read']),
    )
    // The claims themselves are not kept on the user.
    expect(store.user).not.toHaveProperty('realm_access')
    expect(store.user).not.toHaveProperty('resource_access')
  })

  it('opens what either role opens, and nothing a role of another client would', async () => {
    backend(ada)
    await signIn()

    expect(opens({ requiredRole: 'manager' })).toBe('allow')
    expect(opens({ requiredRole: 'auditor' as Role })).toBe('allow')
    expect(opens({ requiredPermission: 'audit:read' })).toBe('allow')
    expect(opens({ requiredPermission: 'customers:manage' })).toBe('allow')
    expect(opens({ requiredRole: 'admin' })).toBe('forbidden')
    expect(opens({ requiredPermission: 'users:delete' })).toBe('forbidden')
  })

  it('reads the user the same way when the session is asked for again', async () => {
    backend({ ...ada, realm_access: { roles: ['team-lead'] }, resource_access: {} })

    const user = await createAuthAdapter('jwt').getUser()

    expect(user).toMatchObject({ role: 'manager', roles: ['manager'] })
  })

  it('gives a user whose roles the app does not have no role, and nothing to open', async () => {
    // A role created at the provider last week, and one from another client.
    backend({
      ...ada,
      realm_access: { roles: ['offline_access', 'platform-owner'] },
      resource_access: { 'other-app': { roles: ['admin'] } },
    })

    const store = await signIn()

    expect(store.isAuthenticated).toBe(true)
    expect(store.user).not.toHaveProperty('role')
    expect(store.userRoles).toEqual([])
    expect(store.userRole).toBe('guest')
    expect(store.userPermissions).toEqual([])
    expect(opens({ requiredPermission: 'dashboard:read' })).toBe('forbidden')
    expect(opens({ requiredRole: 'viewer' })).toBe('forbidden')
    // Signed in, and still allowed where only a session is asked for.
    expect(opens({})).toBe('allow')
    expect(logged.warnings().join('\n')).toContain('Ignored the role "platform-owner"')
  })

  it('grants nothing from claims that are not the shape they should be', async () => {
    backend({ ...ada, realm_access: 'super_admin', resource_access: ['admin'] })

    const store = await signIn()

    expect(store.userRoles).toEqual([])
    expect(store.userPermissions).toEqual([])
  })
})
