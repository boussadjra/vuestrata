import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vite-plus/test'
import {
  defineAsyncComponent,
  defineComponent,
  h,
  nextTick,
  ref,
  Suspense,
  type Component,
  type Ref,
} from 'vue'
import {
  createMemoryHistory,
  createRouter,
  RouterView,
  type RouteLocationNormalized,
  type RouteRecordRaw,
} from 'vue-router'

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
const PRODUCTION_UPDATE_INFO = 'https://vuejs.org/error-reference/#runtime-15'
const PRODUCTION_WATCHER_INFO = 'https://vuejs.org/error-reference/#runtime-3'

interface Harness {
  wrapper: VueWrapper
  router: ReturnType<typeof createRouter>
  errorHandler: ReturnType<typeof vi.fn>
  /** Render the child now, for a `deferred` harness. */
  reveal: () => Promise<void>
  /** Hand the boundary a router error, as vue-router's `onError` would. */
  routerError: (error: unknown, to: RouteLocationNormalized) => void
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
  const onError = vi.spyOn(router, 'onError')

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
  const routerError: Harness['routerError'] = (error, to) => {
    for (const [listener] of onError.mock.calls) listener(error, to, router.currentRoute.value)
  }
  return { wrapper, router, errorHandler, reveal, routerError }
}

/**
 * Past the task the boundary waits before it decides about a failed async
 * component loader. `flushPromises()` alone does not always get there.
 */
async function settle(): Promise<void> {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

/** A page that renders `<RouterView>`, for tests that need real route components. */
const routerView = defineComponent({ render: () => h(RouterView) })

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

  it('counts failures in a row, so a render that recovers every time is never trapped', async () => {
    // A detail panel that throws for a bad record, or a template that reads
    // data which is briefly undefined on each refetch: any number of failures
    // over the life of a page, each followed by a render that worked.
    const broken = ref(false)
    const child = defineComponent({
      render() {
        if (broken.value) throw new Error('bad record')
        return h('p', { 'data-testid': 'page' }, 'page')
      },
    })
    const { errorHandler } = await mountBoundary(child)

    for (let round = 0; round < 4; round++) {
      broken.value = true
      await flushPromises()
      expect(document.querySelector('[data-testid="page"]')).toBeNull()
      broken.value = false
      await flushPromises()
    }

    expect(errorHandler).toHaveBeenCalledTimes(4)
    expect(fallback()).toBeNull()
    expect(document.querySelector('[data-testid="page"]')).not.toBeNull()
    expect(reporter.captureException).not.toHaveBeenCalled()
  })

  it('starts the count again after a render that worked', async () => {
    const tick = ref(0)
    const broken = ref(true)
    const child = defineComponent({
      render() {
        void tick.value
        if (broken.value) throw new Error('render is broken')
        return h('p', { 'data-testid': 'page' }, 'page')
      },
    })
    const { reveal } = await mountBoundary(child, [], { deferred: true })
    // Two in a row, one that works, then two more: never three.
    await reveal()
    tick.value++
    await flushPromises()
    broken.value = false
    await flushPromises()
    broken.value = true
    await flushPromises()
    tick.value++
    await flushPromises()
    expect(fallback()).toBeNull()

    // The third in a row.
    tick.value++
    await flushPromises()
    expect(fallback()).not.toBeNull()
  })

  describe('a component update that fails', () => {
    // The render worked and applying it did not. Vue gives no sign of an
    // update that later went through, so these count while they come close
    // together. A development build cannot be made to produce one on demand.
    const updating = () => ({ $: { isUnmounted: false, subTree: {} }, $options: {} })

    it('is trapped on the third in quick succession', async () => {
      vi.useFakeTimers()
      const { wrapper } = await mountBoundary(
        defineComponent({ render: () => h('p', { 'data-testid': 'page' }, 'page') }),
      )
      const hook = boundaryHook(wrapper)
      const instance = updating()

      expect(hook(new Error('patch failed'), instance, PRODUCTION_UPDATE_INFO)).toBeUndefined()
      await vi.advanceTimersByTimeAsync(1000)
      expect(hook(new Error('patch failed'), instance, PRODUCTION_UPDATE_INFO)).toBeUndefined()
      await vi.advanceTimersByTimeAsync(1000)
      expect(hook(new Error('patch failed'), instance, PRODUCTION_UPDATE_INFO)).toBe(false)
    })

    it('is not trapped when the failures are far apart', async () => {
      vi.useFakeTimers()
      const { wrapper } = await mountBoundary(
        defineComponent({ render: () => h('p', { 'data-testid': 'page' }, 'page') }),
      )
      const hook = boundaryHook(wrapper)
      const instance = updating()

      for (let round = 0; round < 5; round++) {
        expect(hook(new Error('patch failed'), instance, PRODUCTION_UPDATE_INFO)).toBeUndefined()
        await vi.advanceTimersByTimeAsync(6000)
      }
      expect(fallback()).toBeNull()
    })
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

describe('a setup() that fails below a page', () => {
  const brokenLeaf = defineComponent({
    setup() {
      throw new Error('dialog failed')
    },
    render: () => h('p', 'never'),
  })

  /** A page with a form on it, and a leaf it mounts when `open` says so. */
  function pageWith(open: Ref<boolean>) {
    return defineComponent({
      render: () =>
        h('div', { 'data-testid': 'page' }, [
          h('input', { 'data-testid': 'form' }),
          open.value ? h(brokenLeaf) : null,
        ]),
    })
  }

  it('leaves a page that is already on screen alone', async () => {
    // A dialog that fails to set up after a click must not replace the page
    // the visitor was filling in.
    const open = ref(false)
    const { router, errorHandler } = await mountBoundary(routerView, [
      { path: '/page', component: pageWith(open) },
    ])
    await router.push('/page')
    await flushPromises()

    open.value = true
    await flushPromises()

    expect(fallback()).toBeNull()
    expect(document.querySelector('[data-testid="form"]')).not.toBeNull()
    // Not the boundary's, so it goes where every other error goes.
    expect(errorHandler).toHaveBeenCalledTimes(1)
    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'dialog failed' }),
      expect.anything(),
      'setup function',
    )
    expect(reporter.captureException).not.toHaveBeenCalled()
  })

  it('is trapped while the page is still coming up', async () => {
    const open = ref(true)
    const { router, errorHandler } = await mountBoundary(routerView, [
      { path: '/page', component: pageWith(open) },
    ])

    await router.push('/page')
    await flushPromises()

    expect(fallback()).not.toBeNull()
    expect(errorHandler).not.toHaveBeenCalled()
    expect(reporter.captureException).toHaveBeenCalledTimes(1)
  })

  it('is trapped while the page waits inside Suspense, mounted but not yet shown', async () => {
    const asyncLeaf = defineComponent({
      async setup() {
        await Promise.resolve()
        throw new Error('async leaf failed')
      },
      render: () => h('p', 'never'),
    })
    const page = defineComponent({
      render: () => h('div', { 'data-testid': 'page' }, [h(asyncLeaf)]),
    })
    // A first load: the page mounts off screen while Suspense waits for the
    // leaf, so "mounted" alone would call it a page the visitor is using.
    const { router, errorHandler, reveal } = await mountBoundary(
      routerView,
      [{ path: '/page', component: page }],
      { suspense: true, deferred: true },
    )
    await router.push('/page')

    await reveal()

    expect(fallback()).not.toBeNull()
    expect(errorHandler).not.toHaveBeenCalled()
  })

  it('is trapped when it is the route component that fails, whatever is mounted above it', async () => {
    const layout = defineComponent({
      render: () => h('div', { 'data-testid': 'layout' }, [h(RouterView)]),
    })
    const { router, errorHandler } = await mountBoundary(routerView, [
      {
        path: '/app',
        component: layout,
        children: [
          { path: 'fine', component: { render: () => h('p', 'fine') } },
          { path: 'broken', component: brokenLeaf },
        ],
      },
    ])
    await router.push('/app/fine')
    await flushPromises()
    expect(document.querySelector('[data-testid="layout"]')).not.toBeNull()

    await router.push('/app/broken')
    await flushPromises()

    expect(fallback()).not.toBeNull()
    expect(errorHandler).not.toHaveBeenCalled()
  })
})

describe('an async component whose loader fails', () => {
  const modes: Array<[string, boolean]> = [
    ['inside Suspense', true],
    ['outside Suspense', false],
  ]

  it.each(modes)('is trapped %s, and reported once', async (_label, suspense) => {
    const Lazy = defineAsyncComponent(() => Promise.reject(new Error('loader failed')))
    const { errorHandler, reveal } = await mountBoundary(Lazy, [], { suspense, deferred: true })

    await reveal()
    await settle()

    expect(fallback()).not.toBeNull()
    expect(fallback()?.textContent).toContain('could not be loaded')
    expect(errorHandler).not.toHaveBeenCalled()
    expect(reporter.captureException).toHaveBeenCalledTimes(1)
    expect(reporter.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'loader failed' }),
      expect.objectContaining({ source: 'vue:boundary', info: 'async component loader' }),
    )
  })

  // Pins what the boundary reads from Vue. `defineAsyncComponent()` calls the
  // error hooks for a failed loader whether or not it has an `errorComponent`;
  // the only difference is that it then renders it, with the error as a prop.
  it.each(modes)(
    'is left to the component %s when it has its own errorComponent',
    async (_label, suspense) => {
      const failure = new Error('loader failed')
      const Lazy = defineAsyncComponent({
        loader: () => Promise.reject(failure),
        errorComponent: defineComponent({
          props: { error: { type: Error, required: true } },
          render() {
            return h(
              'p',
              { 'data-testid': 'own-error' },
              `chart unavailable: ${this.error.message}`,
            )
          },
        }),
      })
      const { errorHandler, reveal } = await mountBoundary(Lazy, [], { suspense, deferred: true })

      await reveal()
      await settle()

      expect(fallback()).toBeNull()
      expect(document.querySelector('[data-testid="own-error"]')?.textContent).toBe(
        'chart unavailable: loader failed',
      )
      // Still reported, by the app handler, once.
      expect(errorHandler).toHaveBeenCalledTimes(1)
      expect(errorHandler).toHaveBeenCalledWith(
        failure,
        expect.anything(),
        'async component loader',
      )
      expect(reporter.captureException).not.toHaveBeenCalled()
    },
  )

  it('is not trapped when the visitor left before it failed', async () => {
    const loader: { fail?: (error: Error) => void } = {}
    const Lazy = defineAsyncComponent(
      () =>
        new Promise<Component>((_resolve, reject) => {
          loader.fail = reject
        }),
    )
    const { router, errorHandler } = await mountBoundary(
      routerView,
      [{ path: '/lazy', component: defineComponent({ render: () => h(Lazy) }) }],
      { suspense: true },
    )
    await router.push('/lazy')
    await flushPromises()
    await router.push('/other')
    await flushPromises()

    loader.fail?.(new Error('loader failed late'))
    await settle()

    expect(fallback()).toBeNull()
    expect(errorHandler).toHaveBeenCalledTimes(1)
    expect(reporter.captureException).not.toHaveBeenCalled()
  })
})

describe('one incident', () => {
  it('is reported once, however much of the page falls over with it', async () => {
    const sibling = defineComponent({
      setup() {
        throw new Error('sibling failed')
      },
      render: () => h('p', 'never'),
    })
    const page = defineComponent({
      render: () => h('div', [h(sibling), h(sibling), h(sibling)]),
    })

    const { errorHandler } = await mountBoundary(page)

    expect(fallback()).not.toBeNull()
    expect(reporter.captureException).toHaveBeenCalledTimes(1)
    expect(errorHandler).not.toHaveBeenCalled()
  })

  it('swallows what the page it took down goes on throwing', async () => {
    // Lazy imports and async setups of components that are already unmounted
    // keep rejecting after the error state is up. They used to reach the app
    // handler: one incident, eight reports.
    const { component } = flakySetup(1)
    const { wrapper } = await mountBoundary(component)
    expect(fallback()).not.toBeNull()

    const handled = boundaryHook(wrapper)(
      new Error('a chart of the dead page failed to load'),
      { $: { isUnmounted: true } },
      PRODUCTION_SETUP_INFO,
    )

    expect(handled).toBe(false)
    expect(reporter.captureException).toHaveBeenCalledTimes(1)
  })

  it('does not swallow an error from the error state itself', async () => {
    const { component } = flakySetup(1)
    const { wrapper } = await mountBoundary(component)
    expect(fallback()).not.toBeNull()

    const handled = boundaryHook(wrapper)(
      new Error('a button of the error state failed'),
      { $: { isUnmounted: false } },
      PRODUCTION_SETUP_INFO,
    )

    // Undefined: Vue carries on to the app handler, which reports it.
    expect(handled).toBeUndefined()
  })

  it('does not swallow an error of a kind it never traps', async () => {
    const { component } = flakySetup(1)
    const { wrapper } = await mountBoundary(component)
    expect(fallback()).not.toBeNull()

    const handled = boundaryHook(wrapper)(
      new Error('a watcher of the dead page threw'),
      { $: { isUnmounted: true } },
      PRODUCTION_WATCHER_INFO,
    )

    expect(handled).toBeUndefined()
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

  it('loads the page again when an async component could not be loaded', async () => {
    // Mounting again cannot work: Chromium keeps a failed dynamic import for
    // the life of the document, so the loader would fail again without a
    // request ever leaving the browser.
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    const load = vi.fn<() => Promise<Component>>().mockRejectedValue(new Error('loader failed'))
    const { reveal } = await mountBoundary(defineAsyncComponent(load), [], { deferred: true })
    await reveal()
    await settle()
    expect(fallback()).not.toBeNull()

    button('retry')?.click()
    await settle()

    expect(reload).toHaveBeenCalledTimes(1)
    // Not mounted again: that is the retry that could not work.
    expect(load).toHaveBeenCalledTimes(1)
    expect(fallback()).not.toBeNull()
  })

  it('loads the page again when a setup() failed on a chunk it imports', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    const onSetup = vi.fn()
    const child = defineComponent({
      async setup() {
        onSetup()
        await Promise.resolve()
        throw new TypeError('Failed to fetch dynamically imported module: /assets/setup-1.js')
      },
      render: () => h('p', 'never'),
    })
    await mountBoundary(child, [], { suspense: true })
    expect(fallback()?.textContent).toContain('could not be loaded')

    button('retry')?.click()
    await flushPromises()

    expect(reload).toHaveBeenCalledTimes(1)
    expect(onSetup).toHaveBeenCalledTimes(1)
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

  it('keeps the page when the router reports an error for the route already on screen', async () => {
    // vue-router sends a `scrollBehavior` that throws to `onError` as well,
    // after the navigation it belongs to has succeeded: `to` is the current
    // route. The page loaded, and "could not be loaded" would replace it.
    const { router, routerError } = await mountBoundary(routerView, [
      { path: '/page', component: { render: () => h('p', { 'data-testid': 'page' }, 'page') } },
    ])
    await router.push('/page')
    await flushPromises()

    routerError(new Error('scrollBehavior threw'), router.currentRoute.value)
    await flushPromises()

    expect(fallback()).toBeNull()
    expect(document.querySelector('[data-testid="page"]')).not.toBeNull()
    expect(reporter.captureException).not.toHaveBeenCalled()
  })

  it('still shows a router error for a route that is not the one on screen', async () => {
    const { router, routerError } = await mountBoundary(routerView)

    routerError(new Error('a guard threw'), router.resolve('/other') as RouteLocationNormalized)
    await flushPromises()

    expect(fallback()?.textContent).toContain('could not be loaded')
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
