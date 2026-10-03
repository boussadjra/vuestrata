import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { defineComponent, h, ref, type Ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'

import { useUnsavedChangesGuard } from '@/composables/forms'

/**
 * The unsaved-changes guard, against a real router.
 *
 * A navigation guard is only as good as what the router does with its answer,
 * so nothing about the router is faked: the tests navigate and look at where
 * they ended up.
 */

type Guard = ReturnType<typeof useUnsavedChangesGuard>

interface Harness {
  router: Router
  wrapper: VueWrapper
  isDirty: Ref<boolean>
  enabled: Ref<boolean>
  /** Whether the routed page is rendered at all. */
  shown: Ref<boolean>
  guard: () => Guard
}

const mounted: VueWrapper[] = []

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
})

/** Whether the browser would ask before the page unloads right now. */
function unloadIsBlocked(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

async function mountGuarded(where: 'page' | 'outside-router-view' = 'page'): Promise<Harness> {
  const isDirty = ref(false)
  const enabled = ref(true)
  const shown = ref(true)
  const captured: { guard?: Guard } = {}

  const Guarded = defineComponent({
    setup() {
      captured.guard = useUnsavedChangesGuard(isDirty, { enabled })
      return () => h('p', 'form')
    },
  })
  const Other = defineComponent({ render: () => h('p', 'other') })

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/form/:id', component: where === 'page' ? Guarded : Other },
      { path: '/other', component: Other },
    ],
  })
  await router.push('/form/1')
  await router.isReady()

  const Root = defineComponent({
    render: () => {
      const view = shown.value ? h(RouterView) : null
      return where === 'page' ? view : [h(Guarded), view]
    },
  })
  const wrapper = mount(Root, { global: { plugins: [router] } })
  mounted.push(wrapper)
  await flushPromises()

  return { router, wrapper, isDirty, enabled, shown, guard: () => captured.guard! }
}

describe('leaving the route', () => {
  it('goes ahead without asking while nothing has changed', async () => {
    const { router, guard } = await mountGuarded()

    await router.push('/other')

    expect(router.currentRoute.value.path).toBe('/other')
    expect(guard().isPrompting.value).toBe(false)
  })

  it('is held while there are unsaved changes, and cancelled by "stay"', async () => {
    const { router, isDirty, guard } = await mountGuarded()
    isDirty.value = true

    const navigation = router.push('/other')
    await flushPromises()

    expect(guard().isPrompting.value).toBe(true)
    expect(router.currentRoute.value.path).toBe('/form/1')

    guard().stay()
    const failure = await navigation

    expect(failure).toBeTruthy()
    expect(router.currentRoute.value.path).toBe('/form/1')
    expect(guard().isPrompting.value).toBe(false)
  })

  it('goes ahead once the user chooses to discard', async () => {
    const { router, isDirty, guard } = await mountGuarded()
    isDirty.value = true

    const navigation = router.push('/other')
    await flushPromises()
    expect(guard().isPrompting.value).toBe(true)

    guard().leave()
    await navigation

    expect(router.currentRoute.value.path).toBe('/other')
  })

  it('asks again the next time, after the user stayed', async () => {
    const { router, isDirty, guard } = await mountGuarded()
    isDirty.value = true

    const first = router.push('/other')
    await flushPromises()
    guard().stay()
    await first

    const second = router.push('/other')
    await flushPromises()
    expect(guard().isPrompting.value).toBe(true)
    guard().leave()
    await second

    expect(router.currentRoute.value.path).toBe('/other')
  })

  it('does not block once the changes have been saved', async () => {
    const { router, isDirty, guard } = await mountGuarded()
    isDirty.value = true
    // What a successful save does: the form is re-baselined, so it is clean.
    isDirty.value = false

    await router.push('/other')

    expect(router.currentRoute.value.path).toBe('/other')
    expect(guard().isPrompting.value).toBe(false)
  })

  it('never asks when it is disabled', async () => {
    const { router, isDirty, enabled, guard } = await mountGuarded()
    enabled.value = false
    isDirty.value = true

    await router.push('/other')

    expect(router.currentRoute.value.path).toBe('/other')
    expect(guard().isPrompting.value).toBe(false)
  })

  it('lets a query or a hash change through: the page and its form stay', async () => {
    const { router, isDirty, guard } = await mountGuarded()
    isDirty.value = true

    await router.push('/form/1?tab=notes')
    await router.push('/form/1?tab=notes#history')

    expect(router.currentRoute.value.fullPath).toBe('/form/1?tab=notes#history')
    expect(guard().isPrompting.value).toBe(false)
  })

  it('asks when the same page is reused for another record', async () => {
    const { router, isDirty, guard } = await mountGuarded()
    isDirty.value = true

    const navigation = router.push('/form/2')
    await flushPromises()

    expect(guard().isPrompting.value).toBe(true)
    guard().stay()
    await navigation
    expect(router.currentRoute.value.path).toBe('/form/1')
  })

  it('keeps the first navigation where it is when a second one arrives', async () => {
    const { router, isDirty, guard } = await mountGuarded()
    isDirty.value = true

    const first = router.push('/other')
    await flushPromises()
    const second = router.push('/form/2')
    await flushPromises()

    expect(guard().isPrompting.value).toBe(true)
    guard().leave()
    await Promise.all([first, second])

    expect(router.currentRoute.value.path).toBe('/form/2')
  })

  it('cancels a navigation still waiting when the form goes away', async () => {
    const { router, isDirty, guard, shown } = await mountGuarded()
    isDirty.value = true

    const navigation = router.push('/other')
    await flushPromises()
    expect(guard().isPrompting.value).toBe(true)

    // The page is torn down around the open question (a parent's v-if, say).
    shown.value = false
    await navigation

    expect(router.currentRoute.value.path).toBe('/form/1')
  })
})

describe('outside a routed page', () => {
  it('guards every navigation for as long as the caller is mounted', async () => {
    const { router, isDirty, guard, wrapper } = await mountGuarded('outside-router-view')
    isDirty.value = true

    const navigation = router.push('/other')
    await flushPromises()
    expect(guard().isPrompting.value).toBe(true)
    guard().stay()
    await navigation
    expect(router.currentRoute.value.path).toBe('/form/1')

    wrapper.unmount()
    await router.push('/other')
    expect(router.currentRoute.value.path).toBe('/other')
  })

  it('works with no router at all: only the browser’s own prompt is left', () => {
    const isDirty = ref(true)
    const wrapper = mount(
      defineComponent({
        setup() {
          useUnsavedChangesGuard(isDirty)
          return () => h('p', 'form')
        },
      }),
    )
    mounted.push(wrapper)

    expect(unloadIsBlocked()).toBe(true)
  })
})

describe('reload, closed tab, typed address', () => {
  it('asks the browser to confirm only while there are unsaved changes', async () => {
    const { isDirty } = await mountGuarded()

    expect(unloadIsBlocked()).toBe(false)

    isDirty.value = true
    expect(unloadIsBlocked()).toBe(true)

    isDirty.value = false
    expect(unloadIsBlocked()).toBe(false)
  })

  it('does not when it is disabled', async () => {
    const { isDirty, enabled } = await mountGuarded()
    isDirty.value = true
    expect(unloadIsBlocked()).toBe(true)

    enabled.value = false
    expect(unloadIsBlocked()).toBe(false)
  })

  it('removes its listener with the form', async () => {
    const { isDirty, wrapper } = await mountGuarded()
    isDirty.value = true
    expect(unloadIsBlocked()).toBe(true)

    wrapper.unmount()
    expect(unloadIsBlocked()).toBe(false)
  })
})
