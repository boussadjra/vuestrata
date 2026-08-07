import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { resolveRouteAccess, type GuardedRoute, type GuardSubject } from '@/plugins/route-guard'
import { installRuntimeBackends, resetRuntimeBackends } from '@/state/runtime-backends'
import type { Permission, Role } from '~/types'

/**
 * The route guard is the app's only client-side access control. It previously
 * lived inline in a `beforeEach` hook that could only be reached by booting a
 * full router, so it had no direct coverage — which is how the anonymous
 * bypass below survived.
 */

function route(meta: GuardedRoute['meta'], fullPath = '/dashboard/secret'): GuardedRoute {
  return { fullPath, meta }
}

const anonymous: GuardSubject = {
  isAuthenticated: false,
  // What `authStore.userRole` reports with no user.
  role: 'guest',
  permissions: undefined,
}

function signedIn(role: Role, permissions?: Permission[]): GuardSubject {
  return { isAuthenticated: true, role, permissions }
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetRuntimeBackends()
  installRuntimeBackends()
})

describe('route guard — authentication', () => {
  it('allows an unconstrained route', () => {
    expect(resolveRouteAccess(route({}), anonymous)).toEqual({ type: 'allow' })
  })

  it('redirects an anonymous user away from requiresAuth and preserves the destination', () => {
    const decision = resolveRouteAccess(
      route({ requiresAuth: true }, '/dashboard/billing'),
      anonymous,
    )

    expect(decision).toEqual({ type: 'login', redirect: '/dashboard/billing' })
  })

  it('admits an authenticated user to a requiresAuth route', () => {
    const decision = resolveRouteAccess(route({ requiresAuth: true }), signedIn('member'))

    expect(decision).toEqual({ type: 'allow' })
  })
})

describe('route guard — anonymous bypass regression', () => {
  /**
   * The bug: every role and permission check was nested inside
   * `if (authStore.isAuthenticated)`. A route that declared a permission but
   * forgot `requiresAuth: true` therefore skipped the check entirely for
   * anonymous visitors — the exact people it was meant to stop — while
   * correctly blocking signed-in users who lacked the permission.
   *
   * Forgetting `requiresAuth` is an easy mistake, and it failed OPEN.
   */
  it('blocks an anonymous user from a permission-gated route that omits requiresAuth', () => {
    const decision = resolveRouteAccess(route({ requiredPermission: 'billing:read' }), anonymous)

    expect(decision).toEqual({ type: 'forbidden' })
  })

  it('blocks an anonymous user from a role-gated route that omits requiresAuth', () => {
    const decision = resolveRouteAccess(route({ requiredRole: 'admin' }), anonymous)

    expect(decision).toEqual({ type: 'forbidden' })
  })

  it('blocks an anonymous user from a multi-permission route that omits requiresAuth', () => {
    const decision = resolveRouteAccess(
      route({ requiredPermissions: ['users:read', 'users:update'] }),
      anonymous,
    )

    expect(decision).toEqual({ type: 'forbidden' })
  })

  it('still prefers the login redirect when requiresAuth IS declared', () => {
    // Redirecting to login is friendlier than a 403 when we know the user
    // simply has not signed in yet.
    const decision = resolveRouteAccess(
      route({ requiresAuth: true, requiredPermission: 'billing:read' }),
      anonymous,
    )

    expect(decision.type).toBe('login')
  })
})

describe('route guard — roles', () => {
  it('admits a role at or above the required level', () => {
    expect(resolveRouteAccess(route({ requiredRole: 'manager' }), signedIn('admin'))).toEqual({
      type: 'allow',
    })
  })

  it('rejects a role below the required level', () => {
    expect(resolveRouteAccess(route({ requiredRole: 'admin' }), signedIn('viewer'))).toEqual({
      type: 'forbidden',
    })
  })
})

describe('route guard — permissions', () => {
  it('admits a user holding the required permission explicitly', () => {
    const decision = resolveRouteAccess(
      route({ requiresAuth: true, requiredPermission: 'billing:read' }),
      signedIn('member', ['billing:read']),
    )

    expect(decision).toEqual({ type: 'allow' })
  })

  it('rejects a user missing the required permission', () => {
    const decision = resolveRouteAccess(
      route({ requiresAuth: true, requiredPermission: 'billing:manage' }),
      signedIn('member', ['billing:read']),
    )

    expect(decision).toEqual({ type: 'forbidden' })
  })

  it('requires every permission by default', () => {
    const decision = resolveRouteAccess(
      route({ requiresAuth: true, requiredPermissions: ['users:read', 'users:delete'] }),
      signedIn('member', ['users:read']),
    )

    expect(decision).toEqual({ type: 'forbidden' })
  })

  it('requires only one permission in "any" mode', () => {
    const decision = resolveRouteAccess(
      route({
        requiresAuth: true,
        requiredPermissions: ['users:read', 'users:delete'],
        permissionMode: 'any',
      }),
      signedIn('member', ['users:read']),
    )

    expect(decision).toEqual({ type: 'allow' })
  })
})

describe('route guard — permission context', () => {
  it('fails closed when the context resolver throws', () => {
    // A resolver that throws cannot be trusted to supply the data a predicate
    // needs; proceeding without it would grant access on the base role check
    // alone, which is the escalation the context exists to prevent.
    const decision = resolveRouteAccess(
      route({
        requiresAuth: true,
        requiredPermission: 'billing:read',
        permissionContext: () => {
          throw new Error('resolver exploded')
        },
      }),
      signedIn('super_admin'),
    )

    expect(decision).toEqual({ type: 'forbidden' })
  })

  it('passes a resolved context through without altering an otherwise-valid decision', () => {
    const resolver = vi.fn(() => ({ tenantId: 't1' }))
    const decision = resolveRouteAccess(
      route({
        requiresAuth: true,
        requiredPermission: 'billing:read',
        permissionContext: resolver,
      }),
      signedIn('member', ['billing:read']),
    )

    expect(resolver).toHaveBeenCalledOnce()
    expect(decision).toEqual({ type: 'allow' })
  })
})
