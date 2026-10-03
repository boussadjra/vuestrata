import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createMemoryHistory, createRouter } from 'vue-router'

import AppHeader from '@/components/layout/AppHeader.vue'

/**
 * What the header offers a signed-out visitor.
 *
 * On the login page that is the way to the registration page, and it used to
 * be offered whatever the adapter could do. A backend with no sign-up (the
 * `register` endpoint switched off in `auth.config.ts`), or an SDK that owns
 * registration, then had a "Register" button in the header leading to a page
 * that could do nothing, right above a login form that had already dropped its
 * own link there.
 */

/** What the configured adapter can do. Each test says. */
const capabilities = vi.hoisted(() => ({ register: true }))
const getAuthAdapter = vi.hoisted(() => vi.fn())

vi.mock(import('@/modules/auth'), async (importOriginal) => ({
  ...(await importOriginal()),
  getAuthAdapter,
}))

const view = { template: '<div />' }

async function mountAt(path: string) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/auth/login', '/auth/register', '/pricing'].map((route) => ({
      path: route,
      component: view,
    })),
  })
  await router.push(path)
  await router.isReady()

  return mount(AppHeader, { global: { plugins: [pinia, router] } })
}

const links = (wrapper: Awaited<ReturnType<typeof mountAt>>) =>
  wrapper.findAll('a').map((link) => link.attributes('href'))

describe('AppHeader, for a signed-out visitor', () => {
  beforeEach(() => {
    capabilities.register = true
    getAuthAdapter.mockReset()
    getAuthAdapter.mockImplementation(() => ({ capabilities }))
  })

  it('offers registration from the login page when the adapter can register', async () => {
    const wrapper = await mountAt('/auth/login')

    expect(links(wrapper)).toContain('/auth/register')
  })

  it('offers nothing from the login page when the adapter cannot', async () => {
    capabilities.register = false

    const wrapper = await mountAt('/auth/login')

    expect(links(wrapper)).not.toContain('/auth/register')
    // Nor a link to the page the visitor is already on.
    expect(links(wrapper)).not.toContain('/auth/login')
  })

  it('offers the login page from the registration page, whatever the adapter can do', async () => {
    capabilities.register = false

    expect(links(await mountAt('/auth/register'))).toContain('/auth/login')
  })

  it('offers the login page everywhere else, without building an adapter to find out', async () => {
    const wrapper = await mountAt('/pricing')

    expect(links(wrapper)).toContain('/auth/login')
    expect(links(wrapper)).not.toContain('/auth/register')
    expect(getAuthAdapter).not.toHaveBeenCalled()
  })
})
