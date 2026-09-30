import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vite-plus/test'
import type { Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import AppFooter from '@/components/layout/AppFooter.vue'
import AppHeader from '@/components/layout/AppHeader.vue'

/**
 * The shell links to `/docs` only when the docs site is there.
 *
 * `vuestrata eject` deletes the docs routes. The header and footer are
 * Vuestrata's files, so they ask the route table rather than being edited — and
 * a project that keeps the docs, or restores them, changes nothing else.
 */

const view = { template: '<div />' }

async function mountWith(component: Component, docs: boolean) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: view },
      { path: '/dashboard', component: view },
      ...(docs
        ? [
            { path: '/docs', component: view },
            { path: '/docs/:slug(.*)*', component: view },
          ]
        : []),
      // The not-found catch-all matches /docs when there is no docs route, so
      // resolving the path would call a dead link live.
      { path: '/:notfound(.*)*', component: view },
    ],
  })
  await router.push('/dashboard')
  await router.isReady()

  return mount(component, { global: { plugins: [pinia, router] } })
}

const docsLinks = (wrapper: Awaited<ReturnType<typeof mountWith>>) =>
  wrapper.findAll('a').filter((link) => link.attributes('href') === '/docs')

describe('AppFooter', () => {
  it('links to the docs when the docs site exists', async () => {
    expect(docsLinks(await mountWith(AppFooter, true))).toHaveLength(1)
  })

  it('has no docs link when it does not, and keeps the rest of its links', async () => {
    const wrapper = await mountWith(AppFooter, false)

    expect(docsLinks(wrapper)).toHaveLength(0)
    expect(wrapper.text()).toContain('GitHub')
  })
})

describe('AppHeader', () => {
  it('links to the docs when the docs site exists, in both its layouts', async () => {
    expect(docsLinks(await mountWith(AppHeader, true))).toHaveLength(2)
  })

  it('has no docs link when it does not', async () => {
    expect(docsLinks(await mountWith(AppHeader, false))).toHaveLength(0)
  })
})
