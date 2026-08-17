import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createMemoryHistory, createRouter } from 'vue-router'

import AccountPage from '@/modules/auth/views/account.vue'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types'

import { createAuthTestUser } from '../../utils/auth-test-helpers'

const adapter = vi.hoisted(() => ({
  name: 'mock',
  transport: 'bearer' as 'bearer' | 'cookie',
  capabilities: {
    register: true,
    social: true,
    magicLink: true,
    mfa: true,
    refresh: true,
    codeExchange: true,
  },
}))

vi.mock('@/modules/auth/composables/useAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/auth/composables/useAuth')>()
  return {
    ...actual,
    getAuthAdapter: () => adapter,
  }
})

function mountAccount(user?: User | null) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/dashboard/account', component: AccountPage },
      { path: '/dashboard/settings', component: { template: '<div />' } },
      { path: '/auth/login', component: { template: '<div />' } },
    ],
  })
  const pinia = createPinia()
  setActivePinia(pinia)

  const store = useAuthStore()
  if (user) store.setUser(user)
  else if (user === null) store.clearAuth()

  return mount(AccountPage, {
    global: {
      plugins: [pinia, router],
    },
  })
}

describe('Account page', () => {
  beforeEach(() => {
    adapter.name = 'mock'
    adapter.transport = 'bearer'
    adapter.capabilities.mfa = true
  })

  it('renders identity, security, and grants without a duplicate profile form', () => {
    const user = createAuthTestUser({
      name: 'Ada Admin',
      email: 'ada@example.test',
      role: 'admin',
      emailVerified: true,
      mfaEnabled: true,
      permissions: ['users:read', 'users:create', 'billing:read'],
    })
    const wrapper = mountAccount(user)

    expect(wrapper.get('h1').text()).toBe('My account')
    expect(wrapper.text()).toContain('Ada Admin')
    expect(wrapper.get('a[href="mailto:ada@example.test"]').text()).toBe('ada@example.test')
    expect(wrapper.text()).toContain('Admin')
    expect(wrapper.text()).toContain('Email verified')
    expect(wrapper.find('[data-ui="data-grid-search"]').exists()).toBe(true)
    expect(wrapper.find('input[disabled]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Workspace preferences')

    const settings = wrapper
      .findAll('a')
      .find((link) => link.attributes('href') === '/dashboard/settings')
    expect(settings?.text()).toContain('Settings')

    expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual([
      'Identity',
      'Security',
      'Effective permissions',
    ])
    expect(wrapper.find('[data-ui="data-grid"]').exists()).toBe(true)
    expect(wrapper.get('[data-ui="data-grid"]').attributes('data-embedded')).toBe('true')
    expect(wrapper.get('[data-ui="data-grid-search"]').attributes('placeholder')).toBe(
      'Search grants...',
    )
    expect(wrapper.text()).not.toContain('account_permissions_')
    expect(wrapper.get('[data-permission="users:read"]').text()).toBe('users:read')
    expect(wrapper.get('[data-permission="billing:read"]').text()).toBe('billing:read')
    expect(wrapper.text()).toContain('View Users')
    expect(wrapper.text()).toContain('Resource')
    expect(wrapper.text()).toContain('Grant')
    expect(wrapper.text()).toContain('Token')
    expect(wrapper.text()).toContain('A second factor is required when you sign in.')
    expect(wrapper.text()).not.toContain('Enabled')
    expect(wrapper.text()).not.toContain('Disabled')
  })

  it('states that MFA is unavailable when the adapter cannot offer it', () => {
    adapter.name = 'oauth'
    adapter.transport = 'cookie'
    adapter.capabilities.mfa = false

    const wrapper = mountAccount(
      createAuthTestUser({
        mfaEnabled: false,
        emailVerified: false,
      }),
    )

    expect(wrapper.text()).toContain(
      'The "oauth" auth adapter does not support multi-factor authentication.',
    )
    expect(wrapper.text()).toContain('Only your password is required to sign in.')
    expect(wrapper.text()).toContain('HttpOnly session cookie with CSRF protection.')
    expect(wrapper.text()).toContain('Email not verified')
    expect(wrapper.text()).not.toContain('Disabled')
  })

  it('shows an empty grants state when the session lists no permissions', () => {
    const wrapper = mountAccount(
      createAuthTestUser({
        permissions: [],
      }),
    )

    expect(wrapper.text()).toContain("No explicit permissions — your role's defaults apply.")
    expect(wrapper.find('[data-permission]').exists()).toBe(false)
  })

  it('explains a missing session instead of rendering a blank page', () => {
    const wrapper = mountAccount(null)

    expect(wrapper.text()).toContain('No signed-in user')
    expect(wrapper.text()).toContain('This page needs an active session.')
    const login = wrapper.findAll('a').find((link) => link.attributes('href') === '/auth/login')
    expect(login?.text()).toContain('Sign in')
  })
})
