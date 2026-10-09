import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent, h, ref, type Ref } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'

import { UiUnsavedChangesDialog } from '@/components/ui'
import { confirmDiscardingChanges, useUnsavedChangesGuard } from '@/composables/forms'
import { useAuth } from '@/modules/auth/composables/useAuth'
import { getI18n } from '@/plugins/i18n'
import { useAuthStore } from '@/stores/auth'

import { createUser } from '../../fixtures'

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

// ─── A session that ends ─────────────────────────────────────────────────────

const sessionUser = createUser({ role: 'manager' })

/** A routed, guarded page with a login route beside it, and somebody signed in. */
async function mountSignedIn(options: { signedIn?: boolean; forms?: number } = {}) {
  const store = useAuthStore()
  if (options.signedIn ?? true) store.setAuth(sessionUser, 'access-token')

  const isDirty = ref(false)
  const guards: Guard[] = []
  let auth!: ReturnType<typeof useAuth>

  const Form = defineComponent({
    setup() {
      guards.push(useUnsavedChangesGuard(isDirty))
      return () => h('p', 'form')
    },
  })
  const Page = defineComponent({
    setup() {
      auth = useAuth()
      return () => Array.from({ length: options.forms ?? 1 }, () => h(Form))
    },
  })
  const Other = defineComponent({ render: () => h('p', 'other') })

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/form/:id', component: Page },
      { path: '/other', component: Other },
      { path: '/auth/login', component: Other },
    ],
  })
  await router.push('/form/1')
  await router.isReady()

  const wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [router] },
  })
  mounted.push(wrapper)
  await flushPromises()

  return { router, store, isDirty, guards, auth: () => auth }
}

describe('when the session ends', () => {
  it('lets the expiry redirect through, reason and destination intact', async () => {
    const { router, store, isDirty, guards } = await mountSignedIn()
    isDirty.value = true
    expect(unloadIsBlocked()).toBe(true)

    // What bootstrap/auth-wiring.ts does when a 401 could not be refreshed.
    store.clearAuth('expired')
    await router.replace({ path: '/auth/login', query: { reason: 'expired', redirect: '/form/1' } })

    expect(router.currentRoute.value.path).toBe('/auth/login')
    expect(router.currentRoute.value.query).toEqual({ reason: 'expired', redirect: '/form/1' })
    expect(guards[0]!.isPrompting.value).toBe(false)
    expect(unloadIsBlocked()).toBe(false)
  })

  it('reads the store when asked, so a store that announces nothing is enough', async () => {
    const { router, store, isDirty, guards } = await mountSignedIn()
    isDirty.value = true

    // A stores/auth.ts from before 1.1.0 clears the session without the event.
    store.$patch({ user: null, token: null })
    await router.replace('/auth/login?reason=expired')

    expect(router.currentRoute.value.path).toBe('/auth/login')
    expect(guards[0]!.isPrompting.value).toBe(false)
  })

  it('answers a question already on screen with "leave" and closes it', async () => {
    const { router, store, isDirty, guards } = await mountSignedIn()
    isDirty.value = true

    const held = router.push('/other')
    await flushPromises()
    expect(guards[0]!.isPrompting.value).toBe(true)

    store.clearAuth('expired')
    expect(guards[0]!.isPrompting.value).toBe(false)
    await held
    await router.replace('/auth/login?reason=expired')

    expect(router.currentRoute.value.path).toBe('/auth/login')
    expect(unloadIsBlocked()).toBe(false)
  })

  it('guards again once somebody is signed in', async () => {
    const { router, store, isDirty, guards } = await mountSignedIn()
    isDirty.value = true
    store.clearAuth('expired')
    expect(unloadIsBlocked()).toBe(false)

    store.setAuth(sessionUser, 'another-token')
    expect(unloadIsBlocked()).toBe(true)

    const navigation = router.push('/other')
    await flushPromises()
    expect(guards[0]!.isPrompting.value).toBe(true)
    guards[0]!.stay()
    await navigation
    expect(router.currentRoute.value.path).toBe('/form/1')
  })

  it('still guards a page nobody was signed in on', async () => {
    const { router, isDirty, guards } = await mountSignedIn({ signedIn: false })
    isDirty.value = true

    const navigation = router.push('/other')
    await flushPromises()

    expect(guards[0]!.isPrompting.value).toBe(true)
    expect(unloadIsBlocked()).toBe(true)
    guards[0]!.stay()
    await navigation
  })
})

describe('signing out with unsaved changes', () => {
  /** The backend behind the configured adapter's sign-out. */
  function backend() {
    return vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 204 }))
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('asks before anything is ended, and "keep editing" ends nothing', async () => {
    const calls = backend()
    const { router, store, isDirty, guards, auth } = await mountSignedIn()
    isDirty.value = true

    const signingOut = auth().logout()
    await flushPromises()

    expect(guards[0]!.isPrompting.value).toBe(true)
    expect(store.isAuthenticated).toBe(true)
    expect(calls).not.toHaveBeenCalled()

    guards[0]!.stay()
    await signingOut

    expect(store.isAuthenticated).toBe(true)
    expect(calls).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/form/1')
    expect(unloadIsBlocked()).toBe(true)
  })

  it('signs out and reaches the login page on "discard", without asking twice', async () => {
    backend()
    const { router, store, isDirty, guards, auth } = await mountSignedIn()
    isDirty.value = true

    const signingOut = auth().logout()
    await flushPromises()
    guards[0]!.leave()
    await signingOut

    expect(store.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.path).toBe('/auth/login')
    expect(guards[0]!.isPrompting.value).toBe(false)
    expect(unloadIsBlocked()).toBe(false)
  })

  it('signs out at once when nothing is unsaved', async () => {
    backend()
    const { router, store, guards, auth } = await mountSignedIn()

    await auth().logout()

    expect(guards[0]!.isPrompting.value).toBe(false)
    expect(store.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.path).toBe('/auth/login')
  })
})

describe('more than one guard on a page', () => {
  it('asks once for a navigation, and both take the one answer', async () => {
    const { router, isDirty, guards } = await mountSignedIn({ forms: 2 })
    isDirty.value = true

    const navigation = router.push('/other')
    await flushPromises()

    expect(guards.filter((guard) => guard.isPrompting.value)).toHaveLength(1)
    guards.find((guard) => guard.isPrompting.value)!.leave()
    await navigation

    expect(router.currentRoute.value.path).toBe('/other')
  })

  it('stays, for both, when the one question is answered "keep editing"', async () => {
    const { router, isDirty, guards } = await mountSignedIn({ forms: 2 })
    isDirty.value = true

    const navigation = router.push('/other')
    await flushPromises()
    guards.find((guard) => guard.isPrompting.value)!.stay()
    await navigation
    expect(router.currentRoute.value.path).toBe('/form/1')

    // And the next navigation is asked about afresh.
    const again = router.push('/other')
    await flushPromises()
    expect(guards.filter((guard) => guard.isPrompting.value)).toHaveLength(1)
    guards.find((guard) => guard.isPrompting.value)!.leave()
    await again
    expect(router.currentRoute.value.path).toBe('/other')
  })
})

describe('a navigation the project allows', () => {
  it('is not held, and every other one still is', async () => {
    const isDirty = ref(true)
    const captured: { guard?: Guard } = {}
    const Guarded = defineComponent({
      setup() {
        captured.guard = useUnsavedChangesGuard(isDirty, {
          allow: (to) => to.path === '/maintenance',
        })
        return () => h('p', 'form')
      },
    })
    const Other = defineComponent({ render: () => h('p', 'other') })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/form', component: Guarded },
        { path: '/other', component: Other },
        { path: '/maintenance', component: Other },
      ],
    })
    await router.push('/form')
    await router.isReady()
    mounted.push(
      mount(defineComponent({ render: () => h(RouterView) }), { global: { plugins: [router] } }),
    )
    await flushPromises()

    const held = router.push('/other')
    await flushPromises()
    expect(captured.guard!.isPrompting.value).toBe(true)
    captured.guard!.stay()
    await held
    expect(router.currentRoute.value.path).toBe('/form')

    await router.push('/maintenance')
    expect(router.currentRoute.value.path).toBe('/maintenance')
  })
})

describe('confirmDiscardingChanges', () => {
  it('answers true at once when nothing is unsaved, and asks when something is', async () => {
    const { isDirty, guards } = await mountSignedIn()

    await expect(confirmDiscardingChanges()).resolves.toBe(true)

    isDirty.value = true
    const answer = confirmDiscardingChanges()
    await flushPromises()
    expect(guards[0]!.isPrompting.value).toBe(true)
    guards[0]!.stay()
    await expect(answer).resolves.toBe(false)
  })
})

describe('the dialog, in a project whose catalog predates it', () => {
  const keys = [
    'form_unsaved_title',
    'form_unsaved_description',
    'form_unsaved_stay',
    'form_unsaved_leave',
  ] as const
  const i18n = getI18n()
  const original = i18n.global.getLocaleMessage('en')

  afterEach(() => {
    i18n.global.setLocaleMessage('en', original)
  })

  it('asks in English instead of showing the keys', async () => {
    const without = { ...original } as Record<string, unknown>
    for (const key of keys) delete without[key]
    i18n.global.setLocaleMessage('en', without as typeof original)

    mounted.push(mount(UiUnsavedChangesDialog, { props: { open: true }, attachTo: document.body }))
    await flushPromises()

    const text = document.body.textContent ?? ''
    for (const key of keys) expect(text).not.toContain(key)
    expect(text).toContain('Discard unsaved changes?')
    expect(text).toContain('Keep editing')
    expect(text).toContain('Discard changes')
  })

  it('uses the catalog as soon as it has the keys', async () => {
    i18n.global.setLocaleMessage('en', { ...original, form_unsaved_stay: 'Stay here' })

    mounted.push(mount(UiUnsavedChangesDialog, { props: { open: true }, attachTo: document.body }))
    await flushPromises()

    expect(document.body.textContent).toContain('Stay here')
  })
})
