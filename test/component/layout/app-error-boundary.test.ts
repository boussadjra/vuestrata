import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vite-plus/test'
import { defineComponent, h, nextTick, ref, Suspense, type Component } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type RouteRecordRaw } from 'vue-router'

import { noteStaleChunkReloadBaseline } from '@/bootstrap/stale-chunk-reload'
import AppErrorBoundary from '@/components/layout/AppErrorBoundary.vue'
import { installErrorReporter, resetErrorReporter, type ErrorReporter } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { handleStaleChunkError } from '@/plugins/stale-chunk'

/**
 * The route-level error boundary.
 *
 * Vue reports WHERE an error happened as a readable string in development and
 * as a `https://vuejs.org/error-reference/#runtime-N` URL in production, and the
 * boundary used to understand only a fragment of the first. The tests below run
 * in development, so the production form is fed to the boundary's hook directly.
 */

const PRODUCTION_SETUP_INFO = 'https://vuejs.org/error-reference/#runtime-0'

interface Harness {
  wrapper: VueWrapper
  router: ReturnType<typeof createRouter>
  errorHandler: ReturnType<typeof vi.fn>
  /** Render the child now, for a `deferred` harness. */
  reveal: () => Promise<void>
}

let reporter: ErrorReporter & { captureException: Mock<ErrorReporter['captureException']> }

beforeEach(() => {
  reporter = {
    name: 'test',
    captureException: vi.fn<ErrorReporter['captureException']>(),
    setUser: vi.fn(),
  }
  installErrorReporter(reporter)
  // The boundary logs what it catches; the noise is not what is under test.
  vi.spyOn(logger, 'error').mockImplementation(() => undefined)
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  resetErrorReporter()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

async function mountBoundary(
  child: Component,
  routes: RouteRecordRaw[] = [],
  { suspense = false, deferred = false }: { suspense?: boolean; deferred?: boolean } = {},
): Promise<Harness> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => h('div', 'home') } },
      { path: '/other', component: { render: () => h('div', 'other') } },
      ...routes,
    ],
  })
  await router.push('/')
  await router.isReady()

  const errorHandler = vi.fn()

  // `mount()` rethrows any error that reaches the app handler while it is mounting,
  // which would fail a test about an error that is meant to be handled. A
  // `deferred` child renders after the mount instead.
  const visible = ref(!deferred)
  const host = defineComponent({
    render: () =>
      h(AppErrorBoundary, null, {
        default: () =>
          !visible.value
            ? null
            : suspense
              ? h(Suspense, null, { default: () => h(child) })
              : h(child),
      }),
  })

  const wrapper = mount(host, {
    attachTo: document.body,
    global: { plugins: [router], config: { errorHandler } },
  })
  await flushPromises()
  const reveal = async () => {
    visible.value = true
    await flushPromises()
  }
  return { wrapper, router, errorHandler, reveal }
}

/**
 * The boundary's `onErrorCaptured` hook, to call with an `info` string or an
 * instance that a development build under test cannot be made to produce.
 */
function boundaryHook(wrapper: VueWrapper): (...args: unknown[]) => unknown {
  const hooks = (wrapper.findComponent(AppErrorBoundary).vm.$ as unknown as { ec: unknown[] }).ec
  return hooks[0] as (...args: unknown[]) => unknown
}

const fallback = () => document.querySelector('[data-testid="app-error-boundary"]')
const button = (id: string) =>
  document.querySelector<HTMLButtonElement>(`[data-testid="app-error-${id}"]`)

/** A component whose `setup()` throws for the first `failures` mounts. */
function flakySetup(failures: number, onSetup = vi.fn()) {
  let remaining = failures
  const component = defineComponent({
    setup() {
      onSetup()
      if (remaining-- > 0) throw new Error('setup failed')
      return () => h('p', { 'data-testid': 'page' }, 'page')
    },
  })
  return { component, onSetup }
}

describe('a fatal error', () => {
  it('shows the error state when a route component throws in setup', async () => {
    const { component } = flakySetup(1)
    const { errorHandler } = await mountBoundary(component)

    expect(fallback()).not.toBeNull()
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="page"]')).toBeNull()
    // The boundary handled it: Vue must not also hand it to the app handler.
    expect(errorHandler).not.toHaveBeenCalled()
  })

  it('shows it when async setup rejects inside Suspense', async () => {
    const asyncChild = defineComponent({
      async setup() {
        await Promise.resolve()
        throw new Error('async setup failed')
      },
      render: () => h('p', 'never'),
    })
    const { errorHandler } = await mountBoundary(asyncChild, [], { suspense: true })

    expect(fallback()).not.toBeNull()
    expect(errorHandler).not.toHaveBeenCalled()
  })

  it('recognises the production form of the info string', async () => {
    // Development builds pass 'setup function'. Production builds pass a URL,
    // and the old check for 'async' in the string could never match it.
    const { wrapper } = await mountBoundary(
      defineComponent({ render: () => h('p', { 'data-testid': 'page' }, 'page') }),
    )
    expect(fallback()).toBeNull()

    const handled = boundaryHook(wrapper)(
      new Error('production setup failure'),
      null,
      PRODUCTION_SETUP_INFO,
    )
    await nextTick()

    expect(handled).toBe(false)
    expect(fallback()).not.toBeNull()
  })

  it('reports the error once, through the boundary, and not through the app handler', async () => {
    const { component } = flakySetup(1)
    const { errorHandler } = await mountBoundary(component)

    expect(reporter.captureException).toHaveBeenCalledTimes(1)
    expect(reporter.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'setup failed' }),
      expect.objectContaining({ source: 'vue:boundary' }),
    )
    expect(errorHandler).not.toHaveBeenCalled()
  })

  it('offers Retry, Reload page and Go home, with the heading focused', async () => {
    const { component } = flakySetup(1)
    await mountBoundary(component)

    expect(button('retry')).not.toBeNull()
    expect(button('reload')).not.toBeNull()
    expect(button('home')).not.toBeNull()

    const heading = document.querySelector('[data-testid="app-error-boundary"] h1')
    expect(heading?.textContent).toBe('Something went wrong')
    expect(document.activeElement).toBe(heading)
  })

  it('uses the app locale for its text', async () => {
    const { getI18n } = await import('@/plugins/i18n')
    const i18n = getI18n()
    const previous = i18n.global.locale.value
    i18n.global.locale.value = 'fr'
    try {
      const { component } = flakySetup(1)
      await mountBoundary(component)
      expect(button('reload')?.textContent?.trim()).toBe('Recharger la page')
    } finally {
      i18n.global.locale.value = previous
    }
  })
})

describe('an error that recovers', () => {
  it('lets a throwing event handler through to the app error handler', async () => {
    const child = defineComponent({
      setup() {
        const onClick = () => {
          throw new Error('handler failed')
        }
        return () => h('button', { 'data-testid': 'page', onClick }, 'go')
      },
    })
    const { wrapper, errorHandler } = await mountBoundary(child)

    await wrapper.get('[data-testid="page"]').trigger('click')

    expect(errorHandler).toHaveBeenCalledTimes(1)
    expect(fallback()).toBeNull()
    expect(document.querySelector('[data-testid="page"]')).not.toBeNull()
    // Reported by the app handler in bootstrap, not by the boundary.
    expect(reporter.captureException).not.toHaveBeenCalled()
  })

  it('lets a render error that clears on the next update through', async () => {
    const ready = ref(false)
    const child = defineComponent({
      render() {
        // A computed reading data an onMounted has not filled in yet.
        if (!ready.value) throw new Error('data not loaded yet')
        return h('p', { 'data-testid': 'page' }, 'page')
      },
    })
    const { errorHandler, reveal } = await mountBoundary(child, [], { deferred: true })
    await reveal()

    expect(errorHandler).toHaveBeenCalledTimes(1)
    expect(fallback()).toBeNull()

    ready.value = true
    await flushPromises()

    expect(document.querySelector('[data-testid="page"]')).not.toBeNull()
    expect(fallback()).toBeNull()
  })

  it('lets a render error through twice: on mount, and when a loading flag flips', async () => {
    const loading = ref(false)
    const data = ref<{ name: string } | null>(null)
    const child = defineComponent({
      render() {
        void loading.value
        return h('p', { 'data-testid': 'page' }, data.value!.name)
      },
    })
    const { errorHandler, reveal } = await mountBoundary(child, [], { deferred: true })
    await reveal()
    loading.value = true
    await flushPromises()

    expect(errorHandler).toHaveBeenCalledTimes(2)
    expect(fallback()).toBeNull()

    data.value = { name: 'loaded' }
    await flushPromises()

    expect(document.querySelector('[data-testid="page"]')?.textContent).toBe('loaded')
    expect(fallback()).toBeNull()
  })

  it('does trap a component whose render keeps failing', async () => {
    const tick = ref(0)
    const child = defineComponent({
      render() {
        void tick.value
        throw new Error('render is broken')
      },
    })
    const { errorHandler, reveal } = await mountBoundary(child, [], { deferred: true })
    await reveal()
    tick.value++
    await flushPromises()
    expect(fallback()).toBeNull()

    tick.value++
    await flushPromises()

    expect(fallback()).not.toBeNull()
    // The first two occurrences went to the app handler; the third is the
    // boundary's, and is the only one it reports.
    expect(errorHandler).toHaveBeenCalledTimes(2)
    expect(reporter.captureException).toHaveBeenCalledTimes(1)
    expect(reporter.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'render is broken' }),
      expect.objectContaining({ source: 'vue:boundary' }),
    )
  })

  it('counts per component instance, so a list of rows failing once each is not trapped', async () => {
    const row = defineComponent({
      render() {
        throw new Error('row is broken')
      },
    })
    const list = defineComponent({
      render: () =>
        h(
          'ul',
          [1, 2, 3, 4, 5].map((key) => h(row, { key })),
        ),
    })
    const { errorHandler, reveal } = await mountBoundary(list, [], { deferred: true })
    await reveal()

    expect(errorHandler).toHaveBeenCalledTimes(5)
    expect(fallback()).toBeNull()
  })

  it('does not trap a request the app cancelled itself', async () => {
    const aborted = defineComponent({
      async setup() {
        await Promise.resolve()
        throw new DOMException('The operation was aborted.', 'AbortError')
      },
      render: () => h('p', 'never'),
    })
    const { errorHandler, reveal } = await mountBoundary(aborted, [], {
      suspense: true,
      deferred: true,
    })
    await reveal()

    expect(errorHandler).toHaveBeenCalledTimes(1)
    expect(fallback()).toBeNull()
  })

  it('does not trap the failure of a page the visitor has already left', async () => {
    const { wrapper } = await mountBoundary(
      defineComponent({ render: () => h('p', { 'data-testid': 'page' }, 'page') }),
    )

    const handled = boundaryHook(wrapper)(
      new Error('the page that was left failed late'),
      { $: { isUnmounted: true } },
      PRODUCTION_SETUP_INFO,
    )
    await nextTick()

    expect(handled).toBeUndefined()
    expect(fallback()).toBeNull()
  })
})

describe('Retry', () => {
  it('remounts the route subtree', async () => {
    const { component, onSetup } = flakySetup(1)
    await mountBoundary(component)
    expect(onSetup).toHaveBeenCalledTimes(1)

    button('retry')?.click()
    await flushPromises()

    expect(fallback()).toBeNull()
    expect(onSetup).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[data-testid="page"]')).not.toBeNull()
  })

  it('shows the state again when the failure is not transient', async () => {
    const { component, onSetup } = flakySetup(2)
    await mountBoundary(component)

    button('retry')?.click()
    await flushPromises()

    expect(onSetup).toHaveBeenCalledTimes(2)
    expect(fallback()).not.toBeNull()
  })
})

describe('navigation', () => {
  it('resets when the route changes', async () => {
    const { component } = flakySetup(1)
    const { router } = await mountBoundary(component)
    expect(fallback()).not.toBeNull()

    await router.push('/other')
    await flushPromises()

    expect(fallback()).toBeNull()
  })

  it('Go home navigates to / and clears the state', async () => {
    // Fails on the first mount and again after the reset the navigation causes.
    const { component } = flakySetup(2)
    const { router } = await mountBoundary(component)
    await router.push('/other')
    await flushPromises()
    expect(fallback()).not.toBeNull()

    button('home')?.click()
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/')
    expect(fallback()).toBeNull()
  })

  it('Go home clears the state when already at /', async () => {
    const { component, onSetup } = flakySetup(1)
    const { router } = await mountBoundary(component)
    expect(router.currentRoute.value.path).toBe('/')
    expect(fallback()).not.toBeNull()

    button('home')?.click()
    await flushPromises()

    expect(fallback()).toBeNull()
    expect(onSetup).toHaveBeenCalledTimes(2)
  })

  it('shows the state when a route fails to load, and Retry loads it as a page', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    const load = vi
      .fn<() => Promise<Component>>()
      .mockRejectedValue(new Error('route module threw'))
    const { router } = await mountBoundary(defineComponent({ render: () => h(RouterView) }), [
      { path: '/lazy', component: load },
    ])

    await router.push('/lazy?tab=2').catch(() => undefined)
    await flushPromises()

    expect(fallback()).not.toBeNull()
    expect(fallback()?.textContent).toContain('could not be loaded')
    expect(reporter.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'route module threw' }),
      expect.objectContaining({ source: 'vue:router' }),
    )

    button('retry')?.click()
    await flushPromises()

    // Not through the router: Chromium keeps a failed dynamic import for the
    // life of the document, so only a page load can ask for the chunk again.
    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith('/lazy?tab=2')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('Reload page reloads the page', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    const { component } = flakySetup(1)
    await mountBoundary(component)

    button('reload')?.click()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('shows the newest failure when Go home cannot load either', async () => {
    // Fails on the first mount and again after the reset the navigation causes.
    const { component } = flakySetup(2)
    const { router } = await mountBoundary(component)
    await router.push('/other')
    await flushPromises()
    expect(fallback()?.textContent).toContain('unexpected problem')
    router.beforeEach((to) => {
      if (to.path === '/') throw new Error('home is broken too')
    })

    button('home')?.click()
    await flushPromises()

    // Still the error state, now for the navigation, and Retry would ask for /.
    expect(router.currentRoute.value.path).toBe('/other')
    expect(fallback()?.textContent).toContain('could not be loaded')
  })
})

describe('while a stale-chunk reload is on its way', () => {
  const staleChunk = new TypeError('Failed to fetch dynamically imported module: /a-1.js')

  /** What `plugins/router.ts` registers, ahead of the boundary's own listener. */
  function reloadOnStaleChunk(router: Harness['router'], reload = vi.fn()) {
    router.onError((error) => {
      handleStaleChunkError(error, reload)
    })
    return reload
  }

  async function mountWithStaleRoute() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { render: () => h('div', 'home') } },
        { path: '/stale', component: () => Promise.reject(staleChunk) },
      ],
    })
    const reload = reloadOnStaleChunk(router)
    // What boot() does before the router is installed.
    noteStaleChunkReloadBaseline()
    await router.push('/')
    await router.isReady()
    mount(
      defineComponent({
        render: () => h(AppErrorBoundary, null, { default: () => h(RouterView) }),
      }),
      { attachTo: document.body, global: { plugins: [router] } },
    )
    await flushPromises()
    return { router, reload }
  }

  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('shows nothing and reports nothing: the page is about to be replaced', async () => {
    vi.useFakeTimers()
    const { router, reload } = await mountWithStaleRoute()

    await router.push('/stale').catch(() => undefined)
    await vi.advanceTimersByTimeAsync(2000)

    expect(reload).toHaveBeenCalledTimes(1)
    expect(fallback()).toBeNull()
    expect(reporter.captureException).not.toHaveBeenCalled()
  })

  it('shows the failure after all when the reload never comes', async () => {
    vi.useFakeTimers()
    const { router } = await mountWithStaleRoute()

    await router.push('/stale').catch(() => undefined)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(fallback()).not.toBeNull()
    expect(reporter.captureException).toHaveBeenCalledTimes(1)
  })

  it('shows the second failure at once: the reload has been spent', async () => {
    // The reload happened in the document before this one, and left its marker.
    handleStaleChunkError(staleChunk, vi.fn())
    const { router, reload } = await mountWithStaleRoute()

    await router.push('/stale').catch(() => undefined)
    await flushPromises()

    expect(reload).not.toHaveBeenCalled()
    expect(fallback()?.textContent).toContain('could not be loaded')
    expect(reporter.captureException).toHaveBeenCalledWith(
      staleChunk,
      expect.objectContaining({ source: 'vue:router', component: '/stale' }),
    )
  })
})
