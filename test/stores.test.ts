import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach } from 'vite-plus/test'
import { nextTick, createApp } from 'vue'

import { getI18n, installI18n } from '@/plugins/i18n'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notification'

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('should start unauthenticated', () => {
    const store = useAuthStore()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.token).toBeNull()
  })

  it('should set auth data', () => {
    const store = useAuthStore()
    store.setAuth({ id: '1', name: 'Test', email: 'test@test.com', role: 'member' }, 'abc123')
    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.name).toBe('Test')
    expect(store.token).toBe('abc123')
  })

  it('should set auth with refresh token', () => {
    const store = useAuthStore()
    store.setAuth(
      { id: '1', name: 'Test', email: 'test@test.com', role: 'admin' },
      'access-tok',
      'refresh-tok',
    )
    expect(store.refreshToken).toBe('refresh-tok')
  })

  it('should compute userRole from user', () => {
    const store = useAuthStore()
    expect(store.userRole).toBe('guest')
    store.setAuth({ id: '1', name: 'Admin', email: 'a@b.com', role: 'admin' }, 'tok')
    expect(store.userRole).toBe('admin')
  })

  it('should clear auth data', () => {
    const store = useAuthStore()
    store.setAuth({ id: '1', name: 'Test', email: 'test@test.com', role: 'member' }, 'abc123')
    store.clearAuth()
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.token).toBeNull()
    expect(localStorage.getItem('vuestrata-auth-token')).toBeNull()
    expect(localStorage.getItem('vuestrata-refresh-token')).toBeNull()
    expect(localStorage.getItem('vuestrata-auth-user')).toBeNull()
  })

  it('should NOT restore auth data from localStorage (in-memory only)', async () => {
    // Tokens are now in-memory only (C-02 fix) — localStorage values are ignored
    localStorage.setItem('vuestrata-auth-token', 'persisted-token')
    localStorage.setItem('vuestrata-refresh-token', 'persisted-refresh')
    localStorage.setItem(
      'vuestrata-auth-user',
      JSON.stringify({
        id: '1',
        name: 'Persisted User',
        email: 'persisted@example.com',
        role: 'admin',
      }),
    )

    const store = useAuthStore()
    await nextTick()
    expect(store.token).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.user).toBeNull()
  })

  it('should start clean even if localStorage has malformed auth data', async () => {
    localStorage.setItem('vuestrata-auth-user', '{broken')

    const store = useAuthStore()
    await nextTick()
    expect(store.user).toBeNull()
  })

  it('should expose explicit user permissions via userPermissions', () => {
    const store = useAuthStore()
    const permissions = ['users:read', 'dashboard:read'] as const
    store.setAuth(
      {
        id: '1',
        name: 'Perm User',
        email: 'perm@example.com',
        role: 'member',
        permissions: [...permissions],
      },
      'tok',
      'rtok',
    )
    expect(store.userPermissions).toEqual(permissions)
  })

  it('userPermissions is empty array when user has no permissions field', () => {
    const store = useAuthStore()
    store.setAuth({ id: '1', name: 'NoPerms', email: 'np@example.com', role: 'member' }, 'tok')
    expect(store.userPermissions).toEqual([])
  })
})

describe('App Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('should have default values', () => {
    const store = useAppStore()
    expect(store.sidebarCollapsed).toBe(false)
    expect(store.locale).toBe('en')
    expect(store.theme).toBe('default')
    expect(store.iconProvider).toBe('solar')
  })

  it('should toggle sidebar', () => {
    const store = useAppStore()
    expect(store.sidebarCollapsed).toBe(false)
    store.toggleSidebar()
    expect(store.sidebarCollapsed).toBe(true)
  })

  it('should toggle dark mode and persist to localStorage', async () => {
    const store = useAppStore()
    expect(store.isDark).toBe(false)
    store.toggleDark()
    await nextTick()
    expect(store.isDark).toBe(true)
    expect(localStorage.getItem('vuestrata-dark')).toBe('true')
  })

  it('should set locale and detect RTL', () => {
    const store = useAppStore()
    store.setLocale('ar')
    expect(store.locale).toBe('ar')
    expect(store.isRtl).toBe(true)
    expect(document.documentElement.dir).toBe('rtl')
    expect(document.documentElement.lang).toBe('ar')
  })

  it('should restore persisted locale', async () => {
    localStorage.setItem('vuestrata-locale', 'fr')
    const store = useAppStore()
    await nextTick()
    expect(store.locale).toBe('fr')
  })

  it('should fall back to default locale for unsupported values', async () => {
    localStorage.setItem('vuestrata-locale', 'de')
    const store = useAppStore()
    await nextTick()
    expect(store.locale).toBe('en')
  })

  it('should switch iconProvider and persist to localStorage', async () => {
    const store = useAppStore()
    store.setIconProvider('lucide')
    await nextTick()
    expect(store.iconProvider).toBe('lucide')
    expect(localStorage.getItem('vuestrata-icon-provider')).toBe('lucide')
  })

  it('should fall back to default and overwrite unknown iconProvider in localStorage', async () => {
    localStorage.setItem('vuestrata-icon-provider', 'nonexistent')
    const store = useAppStore()
    await nextTick()
    expect(store.iconProvider).toBe('solar')
    expect(localStorage.getItem('vuestrata-icon-provider')).toBe('solar')
  })

  it('settings parity: store state is the single source for icon display', () => {
    const store = useAppStore()
    store.setIconProvider('phosphor')
    // Simulate what settings.vue reads for active-state highlighting
    expect(store.iconProvider).toBe('phosphor')
  })

  it('i18n locale should follow the app store locale', async () => {
    localStorage.setItem('vuestrata-locale', 'fr')

    const runtimePinia = createPinia()
    const app = createApp({ render: () => null })
    app.use(runtimePinia)
    installI18n(app)
    app.mount(document.createElement('div'))

    const store = useAppStore(runtimePinia)
    expect(getI18n().global.locale.value).toBe('fr')

    store.setLocale('ar')
    await nextTick()
    expect(getI18n().global.locale.value).toBe('ar')

    app.unmount()
  })
})

describe('Notification Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should add notifications', () => {
    const store = useNotificationStore()
    store.add({ type: 'info', message: 'Hello', duration: 0 })
    expect(store.notifications).toHaveLength(1)
    expect(store.notifications[0]?.message).toBe('Hello')
  })

  it('should remove notifications', () => {
    const store = useNotificationStore()
    store.add({ type: 'info', message: 'Hello', duration: 0 })
    const id = store.notifications[0]!.id
    store.remove(id)
    expect(store.notifications).toHaveLength(0)
  })

  it('should clear all notifications', () => {
    const store = useNotificationStore()
    store.add({ type: 'info', message: 'One', duration: 0 })
    store.add({ type: 'success', message: 'Two', duration: 0 })
    store.clear()
    expect(store.notifications).toHaveLength(0)
  })
})
