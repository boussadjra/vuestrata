import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { defineComponent, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { useActiveLocale, useLocaleSync } from '@/composables/useActiveLocale'
import { getI18n } from '@/plugins/i18n'
import { useAppStore } from '@/stores/app'

const Host = defineComponent({
  setup() {
    useLocaleSync()
    return () => h('div')
  },
})

async function mountSync(url: string): Promise<{ wrapper: VueWrapper; router: Router }> {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/docs', component: { template: '<div />' } },
      { path: '/docs/:slug(.*)*', component: { template: '<div />' } },
      { path: '/dashboard', component: { template: '<div />' } },
    ],
  })

  await router.push(url)
  await router.isReady()

  const wrapper = mount(Host, {
    global: { plugins: [pinia, router, getI18n()] },
  })

  await nextTick()
  return { wrapper, router }
}

describe('useLocaleSync', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.lang = ''
    document.documentElement.removeAttribute('dir')
    getI18n().global.locale.value = 'en'
  })

  afterEach(() => {
    document.documentElement.lang = ''
    document.documentElement.removeAttribute('dir')
    getI18n().global.locale.value = 'en'
  })

  it('locks English LTR on docs without persisting the override', async () => {
    localStorage.setItem('vuestrata-locale', 'ar')
    const { wrapper } = await mountSync('/docs/theming/overview')
    const store = useAppStore()

    expect(store.locale).toBe('ar')
    expect(getI18n().global.locale.value).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
    expect(localStorage.getItem('vuestrata-locale')).toBe('ar')

    wrapper.unmount()
  })

  it('restores the persisted locale after leaving docs', async () => {
    localStorage.setItem('vuestrata-locale', 'ar')
    const { wrapper, router } = await mountSync('/docs')

    expect(document.documentElement.dir).toBe('ltr')

    await router.push('/dashboard')
    await nextTick()

    expect(getI18n().global.locale.value).toBe('ar')
    expect(document.documentElement.lang).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')
    expect(localStorage.getItem('vuestrata-locale')).toBe('ar')

    wrapper.unmount()
  })
})

describe('useActiveLocale', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('dir')
  })

  it('exposes rtl direction for Arabic and ltr on docs', async () => {
    localStorage.setItem('vuestrata-locale', 'ar')

    const LocaleHost = defineComponent({
      setup() {
        const { dir, current } = useActiveLocale()
        return () => h('div', { 'data-dir': dir.value, 'data-current': current.value })
      },
    })

    async function mountAt(url: string) {
      const pinia = createPinia()
      setActivePinia(pinia)
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/dashboard', component: { template: '<div />' } },
          { path: '/docs', component: { template: '<div />' } },
        ],
      })
      await router.push(url)
      await router.isReady()
      return mount(LocaleHost, { global: { plugins: [pinia, router] } })
    }

    const dashboard = await mountAt('/dashboard')
    expect(dashboard.attributes('data-current')).toBe('ar')
    expect(dashboard.attributes('data-dir')).toBe('rtl')
    dashboard.unmount()

    const docs = await mountAt('/docs')
    expect(docs.attributes('data-current')).toBe('en')
    expect(docs.attributes('data-dir')).toBe('ltr')
    docs.unmount()
  })
})
