import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import AppUserMenu from '@/components/layout/AppUserMenu.vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'

import { createAuthTestUser } from '../../utils/auth-test-helpers'

vi.mock('@/modules/auth', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}))

async function mountMenu(locale: 'en' | 'ar' = 'en') {
  localStorage.removeItem('vuestrata-locale')

  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/dashboard', component: { template: '<div />' } },
      { path: '/dashboard/account', component: { template: '<div />' } },
      { path: '/dashboard/settings', component: { template: '<div />' } },
    ],
  })
  await router.push('/dashboard')
  await router.isReady()

  useAuthStore().setAuth(
    createAuthTestUser({ name: 'Demo Admin', email: 'demo@vuestrata.dev', role: 'super_admin' }),
    'access',
    'refresh',
  )
  useAppStore().setLocale(locale)

  return mount(AppUserMenu, {
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  })
}

async function openMenu(wrapper: Awaited<ReturnType<typeof mountMenu>>) {
  const trigger = wrapper.get('[data-testid="account-menu-trigger"]')
  await trigger.trigger('pointerdown')
  await trigger.trigger('click')
  await nextTick()
  return document.querySelector('[data-testid="account-menu"]')
}

describe('AppUserMenu', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('stamps the portalled menu with dir=rtl when Arabic is active', async () => {
    const wrapper = await mountMenu('ar')
    const menu = await openMenu(wrapper)

    expect(menu).not.toBeNull()
    expect(menu?.getAttribute('dir')).toBe('rtl')

    wrapper.unmount()
  })

  it('keeps the portalled menu in LTR for English', async () => {
    const wrapper = await mountMenu('en')
    const menu = await openMenu(wrapper)

    expect(menu).not.toBeNull()
    expect(menu?.getAttribute('dir')).toBe('ltr')

    wrapper.unmount()
  })
})
