import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vite-plus/test'
import { createMemoryHistory, createRouter } from 'vue-router'

import SettingsPage from '@/modules/settings/pages/settings.vue'

vi.mock('@/modules/auth', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}))

async function mountSettings() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/dashboard/settings', component: SettingsPage },
      { path: '/dashboard/account', component: { template: '<div />' } },
    ],
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  await router.push('/dashboard/settings')

  return mount(SettingsPage, {
    global: {
      plugins: [pinia, router],
      stubs: {
        // Reka's switch root is not an input; Formwerk then calls
        // addEventListener on a non-element in jsdom. This page test is about
        // chrome, not the switch — UiSwitch has its own suite.
        UiSwitch: {
          name: 'UiSwitch',
          props: ['modelValue'],
          template:
            '<button type="button" role="switch" v-bind="$attrs" :aria-checked="modelValue" />',
        },
      },
    },
  })
}

describe('Settings page', () => {
  it('uses the same section chrome as the account page', async () => {
    const wrapper = await mountSettings()

    expect(wrapper.get('h1').text()).toBe('Settings')
    expect(wrapper.findAll('[data-ui="card"]').length).toBe(4)
    expect(wrapper.find('div.max-w-5xl').exists()).toBe(true)
    expect(wrapper.html()).not.toContain('animate-fade-in')
    expect(wrapper.findAll('[aria-pressed]').length).toBeGreaterThan(0)

    const account = wrapper
      .findAll('a')
      .find((link) => link.attributes('href') === '/dashboard/account')
    expect(account?.text()).toContain('My account')

    expect(wrapper.text()).toContain('Appearance')
    expect(wrapper.text()).toContain('Shapes')
    expect(wrapper.text()).toContain('Language')
    expect(wrapper.text()).toContain('Icon Provider')
    expect(wrapper.text()).toContain('Sign out')
  })
})
