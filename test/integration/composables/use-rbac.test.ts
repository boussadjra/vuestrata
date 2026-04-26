import { createPinia, setActivePinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vite-plus/test'
import { ref } from 'vue'

import { useRbac } from '@/composables/useRbac'
import { onAuthorizationCheck, clearHooks, registerPredicate, clearPredicates } from '@/lib/rbac'
import type { RbacUserSource, AuthorizationEvent } from '@/lib/rbac/types'
import { useAuthStore } from '@/stores/auth'
import type { User } from '~/types'

import { createUser } from '../../fixtures'

// Mock matchMedia for useAppStorage / useTheme side-effects in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

describe('useRbac composable', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  function setupAuth(overrides: Partial<User> = {}) {
    const auth = useAuthStore()
    const user = createUser(overrides)
    auth.setAuth(user, 'tok-123')
    return auth
  }

  it('should default to guest role when no user is authenticated', () => {
    const { role, permissions } = useRbac()
    expect(role.value).toBe('guest')
    expect(permissions.value).toContain('dashboard:read')
  })

  it('should reflect the authenticated user role', () => {
    setupAuth({ role: 'admin' })
    const { role } = useRbac()
    expect(role.value).toBe('admin')
  })

  it('should use explicit user permissions when provided', () => {
    setupAuth({
      role: 'member',
      permissions: ['users:read', 'dashboard:read'],
    })
    const { can } = useRbac()
    expect(can('users:read')).toBe(true)
    expect(can('billing:manage')).toBe(false)
  })

  it('can() should check a single permission', () => {
    setupAuth({ role: 'admin' })
    const { can } = useRbac()
    expect(can('users:read')).toBe(true)
    expect(can('dashboard:read')).toBe(true)
  })

  it('canAny() should check if any permission is present', () => {
    setupAuth({ role: 'viewer' })
    const { canAny } = useRbac()
    expect(canAny(['dashboard:read', 'billing:manage'])).toBe(true)
    expect(canAny(['billing:manage', 'users:delete'])).toBe(false)
  })

  it('canAll() should check if all permissions are present', () => {
    setupAuth({ role: 'admin' })
    const { canAll } = useRbac()
    expect(canAll(['users:read', 'billing:manage'])).toBe(true)
    expect(canAll(['users:read', 'users:delete'])).toBe(false)
  })

  it('isAtLeast() should check role hierarchy', () => {
    setupAuth({ role: 'manager' })
    const { isAtLeast } = useRbac()
    expect(isAtLeast('member')).toBe(true)
    expect(isAtLeast('manager')).toBe(true)
    expect(isAtLeast('admin')).toBe(false)
  })

  it('should react to auth store changes', () => {
    const auth = setupAuth({ role: 'guest' })
    const { role } = useRbac()
    expect(role.value).toBe('guest')

    auth.setAuth(createUser({ role: 'admin' }), 'tok-456')
    expect(role.value).toBe('admin')
  })
})

// ─── RbacUserSource DI (US3) ─────────────────────────────

describe('useRbac with explicit RbacUserSource', () => {
  it('should use provided source instead of auth store', () => {
    // No Pinia needed for this test
    const source: RbacUserSource = {
      role: ref('manager' as const),
      permissions: ref(['users:read', 'dashboard:read', 'reports:read']),
    }
    const { role, can } = useRbac(source)
    expect(role.value).toBe('manager')
    expect(can('users:read')).toBe(true)
    expect(can('billing:manage')).toBe(false)
  })

  it('canNamespace should work with explicit source', () => {
    const source: RbacUserSource = {
      role: ref('member' as const),
      permissions: ref(['billing:read', 'billing:manage']),
    }
    const { canNamespace } = useRbac(source)
    expect(canNamespace('billing')).toBe(true)
    expect(canNamespace('users')).toBe(false)
  })
})

// ─── Hooks via composable (US6) ──────────────────────────

describe('useRbac hooks integration', () => {
  beforeEach(() => {
    clearHooks()
    clearPredicates()
  })

  it('can() should fire authorization hooks', () => {
    const events: AuthorizationEvent[] = []
    onAuthorizationCheck((e) => events.push(e))

    const source: RbacUserSource = {
      role: ref('admin' as const),
      permissions: ref(['users:read', 'dashboard:read']),
    }
    const { can } = useRbac(source)
    can('users:read')
    expect(events).toHaveLength(1)
    expect(events[0]!.source).toBe('component')
    expect(events[0]!.granted).toBe(true)
  })

  it('can() with context should invoke predicate', () => {
    registerPredicate('users:update', (ctx) => ctx.ownerId === ctx.userId)

    const source: RbacUserSource = {
      role: ref('guest' as const),
      permissions: ref([]),
    }
    const { can } = useRbac(source)
    expect(can('users:update', { ownerId: '1', userId: '1' })).toBe(true)
    expect(can('users:update', { ownerId: '1', userId: '2' })).toBe(false)
  })
})
