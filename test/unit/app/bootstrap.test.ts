import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { App, Component } from 'vue'
import {
  createMemoryHistory,
  createRouter,
  isNavigationFailure,
  NavigationFailureType,
  START_LOCATION,
  type Router,
} from 'vue-router'

import { boot, type BootDeps } from '@/bootstrap'
import { renderBootFailure } from '@/bootstrap/boot-error'
import { VueQueryPlugin, vueQueryOptions } from '@/bootstrap/query-client'
import { installSeams } from '@/bootstrap/seams'
import { installErrorReporter, resetErrorReporter } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { __resetRuntimeSlots, tryGetApiIntegration } from '@/lib/runtime'
import { setupModules } from '@/modules'
import type { createAuthAdapter } from '@/modules/auth'
import { handleStaleChunkError } from '@/plugins/stale-chunk'

/**
 * The boot sequence, asserted step by step against fakes.
 *
 * `main.ts` used to be the only place this order existed, and nothing could
 * boot it without a real router, the whole module registry and a browser. The
 * order is load-bearing — the runtime backends need Pinia, the auth wiring
 * needs the backends, module permissions must be registered before the demo
 * admin is seeded and before a session is restored — so it is pinned here.
 */

// `boot()` imports the real router by default, and the router pulls in the
// layout plugin's virtual module, which only exists in a Vite build. Every test
// here injects its own router, so the real one is never used.
vi.mock('@/plugins/router', () => ({ router: {}, layoutMap: {} }))

const root = { name: 'Root' } as Component

interface Harness {
  calls: string[]
  deps: Partial<BootDeps>
  app: App
  /** `app.use`, held here so a test can read its calls without unbinding a method. */
  use: ReturnType<typeof vi.fn>
  mount: ReturnType<typeof vi.fn>
  authStore: { setRefreshHandler: ReturnType<typeof vi.fn> }
  demo: { onInvalidation: ReturnType<typeof vi.fn> }
}

function harness(overrides: Partial<BootDeps> = {}): Harness {
  const calls: string[] = []
  const track =
    (name: string) =>
    (...args: unknown[]) => {
      void args
      calls.push(name)
    }

  const tags = new Map<unknown, string>()
  const pinia = { tag: 'pinia' }
  const router = {
    tag: 'router',
    isReady: async () => void calls.push('router.isReady'),
    onError: () => () => undefined,
    afterEach: () => () => undefined,
    replace: vi.fn(),
    currentRoute: { value: { meta: {}, path: '/', fullPath: '/' } },
  } as unknown as Router
  tags.set(pinia, 'pinia')
  tags.set(router, 'router')

  const mount = vi.fn(() => void calls.push('app.mount'))
  const use = vi.fn((plugin: unknown) => {
    calls.push(`app.use(${tags.get(plugin) ?? 'plugin'})`)
    return app
  })
  const app = { config: {}, use, mount } as unknown as App

  const authStore = {
    user: null,
    token: null,
    refreshToken: null,
    isAuthenticated: false,
    setAuth: vi.fn(),
    setUser: vi.fn(),
    clearAuth: vi.fn(),
    setRefreshHandler: vi.fn(() => void calls.push('auth.setRefreshHandler')),
  }
  const demo = { onInvalidation: vi.fn(() => void calls.push('demo.onInvalidation')) }

  const adapter = { name: 'mock', transport: 'bearer', capabilities: {}, getUser: vi.fn() }

  const deps: Partial<BootDeps> = {
    bootstrapTheme: track('bootstrapTheme'),
    configureFormwerk: track('configureFormwerk'),
    installErrorReporting: async () => void calls.push('installErrorReporting'),
    installPerformanceMonitoring: track('installPerformanceMonitoring'),
    installErrorHandlers: track('installErrorHandlers'),
    installStaleChunkRecovery: track('installStaleChunkRecovery'),
    createApp: () => {
      calls.push('createApp')
      return app
    },
    pinia: pinia as unknown as BootDeps['pinia'],
    installRuntimeBackends: track('installRuntimeBackends'),
    installSeams: track('installSeams'),
    useAuthStore: () => {
      calls.push('useAuthStore')
      return authStore as unknown as ReturnType<BootDeps['useAuthStore']>
    },
    createAuthAdapter: (() => adapter) as unknown as typeof createAuthAdapter,
    installQuery: track('installQuery'),
    installI18n: track('installI18n'),
    installValidationMessages: track('installValidationMessages'),
    setupModules: async () => void calls.push('setupModules'),
    appModules: [],
    router,
    layoutMap: {},
    restoreSession: async () => void calls.push('restoreSession'),
    removeAppLoader: track('removeAppLoader'),
    startBuildInfo: track('startBuildInfo'),
    renderBootFailure: track('renderBootFailure'),
    config: { authAdapter: 'mock', useMocks: true },
    loadDemoState: async () => {
      calls.push('loadDemoState')
      return {
        seedDemoSuperAdmin: async () => void calls.push('demo.seed'),
        getDemoSession: async () => null,
        onInvalidation: demo.onInvalidation,
      } as never
    },
    startMocks: async () => void calls.push('demo.startMocks'),
    ...overrides,
  }

  return { calls, deps, app, use, mount, authStore, demo }
}

beforeEach(() => {
  // The demo tab sync polls once a second; nothing here should wait for it.
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('boot order', () => {
  it('runs every step, in order, for a demo build with the mock adapter', async () => {
    const { calls, deps } = harness()

    await boot(root, { deps })

    expect(calls).toEqual([
      'bootstrapTheme',
      'configureFormwerk',
      'installErrorReporting',
      'installPerformanceMonitoring',
      'installErrorHandlers',
      'installStaleChunkRecovery',
      'createApp',
      'app.use(pinia)',
      'installRuntimeBackends',
      'installSeams',
      'useAuthStore',
      'auth.setRefreshHandler',
      'installQuery',
      'installI18n',
      'installValidationMessages',
      'setupModules',
      'loadDemoState',
      'demo.seed',
      'restoreSession',
      'app.use(router)',
      'demo.startMocks',
      'router.isReady',
      'app.mount',
      'removeAppLoader',
      'startBuildInfo',
      'loadDemoState',
      'demo.onInvalidation',
    ])
  })

  it('mounts the root component it was given', async () => {
    const created: unknown[] = []
    const { deps, app, mount } = harness()
    deps.createApp = (component) => {
      created.push(component)
      return app
    }

    await boot(root, { deps })

    expect(created).toEqual([root])
    expect(mount).toHaveBeenCalledWith('#app')
  })

  it('reads the project seeds right after the runtime backends and before the auth store', async () => {
    const { calls, deps } = harness()

    await boot(root, { deps })

    const at = (name: string) => calls.indexOf(name)
    expect(at('installSeams')).toBe(at('installRuntimeBackends') + 1)
    expect(at('installSeams')).toBeLessThan(at('useAuthStore'))
  })

  it('registers modules before seeding the demo admin and before restoring the session', async () => {
    const { calls, deps } = harness()

    await boot(root, { deps })

    expect(calls.indexOf('setupModules')).toBeLessThan(calls.indexOf('demo.seed'))
    expect(calls.indexOf('demo.seed')).toBeLessThan(calls.indexOf('restoreSession'))
  })

  it('starts the mock worker after the modules registered, and before the router settles', async () => {
    const { calls, deps } = harness()

    await boot(root, { deps })

    expect(calls.indexOf('setupModules')).toBeLessThan(calls.indexOf('demo.startMocks'))
    expect(calls.indexOf('demo.startMocks')).toBeLessThan(calls.indexOf('router.isReady'))
  })

  it('routes Vue errors to the reporter instead of the console alone', async () => {
    const { deps, app } = harness()

    await boot(root, { deps })

    expect(typeof app.config.errorHandler).toBe('function')
  })

  it('never rejects', async () => {
    const { deps } = harness()
    await expect(boot(root, { deps })).resolves.toBeUndefined()
  })
})

describe('the query plugin', () => {
  it('is installed with the bootstrap options unless the project passes its own', async () => {
    const { deps, use } = harness()
    delete deps.installQuery

    await boot(root, { deps })
    const installed = use.mock.calls.find(([plugin]) => plugin === VueQueryPlugin)
    expect(installed?.[1]).toBe(vueQueryOptions)

    use.mockClear()
    const own = { queryClientConfig: { defaultOptions: { queries: { staleTime: 1 } } } }
    await boot(root, { deps, queryOptions: own })
    expect(use.mock.calls.find(([plugin]) => plugin === VueQueryPlugin)?.[1]).toBe(own)
  })
})

describe('deps', () => {
  it('keeps the default for a dependency passed as undefined', async () => {
    const { calls, deps, use } = harness()
    // `{ installQuery: options.installQuery }` from a caller that has none.
    await boot(root, { deps: { ...deps, installQuery: undefined } })

    expect(use.mock.calls.some(([plugin]) => plugin === VueQueryPlugin)).toBe(true)
    expect(calls).not.toContain('renderBootFailure')
    expect(calls).toContain('app.mount')
  })
})

describe('beforeMount', () => {
  it('runs after the router is ready and just before the app mounts', async () => {
    const { calls, deps, app } = harness()
    const beforeMount = vi.fn(async (received: App) => {
      expect(received).toBe(app)
      calls.push('beforeMount')
    })

    await boot(root, { deps, beforeMount })

    expect(calls.indexOf('router.isReady')).toBeLessThan(calls.indexOf('beforeMount'))
    expect(calls.indexOf('beforeMount')).toBe(calls.indexOf('app.mount') - 1)
  })

  it('reports a failure in it and does not mount', async () => {
    const failure = new Error('plugin blew up')
    const { calls, deps } = harness()
    const renderBootFailure = vi.fn()

    await boot(root, {
      deps: { ...deps, renderBootFailure },
      beforeMount: () => {
        throw failure
      },
    })

    expect(renderBootFailure).toHaveBeenCalledWith(failure)
    expect(calls).not.toContain('app.mount')
  })
})

describe('a failing step', () => {
  const steps: Array<[string, (failure: Error) => Partial<BootDeps>, string]> = [
    [
      'installErrorReporting',
      (e) => ({ installErrorReporting: () => Promise.reject(e) }),
      'createApp',
    ],
    [
      'installRuntimeBackends',
      (e) => ({
        installRuntimeBackends: () => {
          throw e
        },
      }),
      'useAuthStore',
    ],
    ['setupModules', (e) => ({ setupModules: () => Promise.reject(e) }), 'restoreSession'],
    ['restoreSession', (e) => ({ restoreSession: () => Promise.reject(e) }), 'app.mount'],
    [
      'router.isReady',
      (e) => ({
        router: {
          isReady: () => Promise.reject(e),
          onError: () => () => undefined,
          afterEach: () => () => undefined,
          replace: vi.fn(),
          currentRoute: { value: START_LOCATION },
        } as never,
      }),
      'app.mount',
    ],
  ]

  it.each(steps)(
    '%s hands the error to renderBootFailure and stops',
    async (_name, fail, later) => {
      const failure = new Error('step failed')
      const renderBootFailure = vi.fn()
      const { calls, deps } = harness()

      await expect(
        boot(root, { deps: { ...deps, ...fail(failure), renderBootFailure } }),
      ).resolves.toBeUndefined()

      expect(renderBootFailure).toHaveBeenCalledTimes(1)
      expect(renderBootFailure).toHaveBeenCalledWith(failure)
      expect(calls).not.toContain(later)
      expect(calls).not.toContain('removeAppLoader')
    },
  )

  it('catches a first navigation that failed before boot got to waiting for it', async () => {
    // vue-router only rejects isReady() for callers already waiting. In a demo
    // build the mock worker starts in between, and a first navigation that
    // failed meanwhile used to leave isReady() pending, and the splash up, for
    // ever.
    const failure = new Error('the first route could not be loaded')
    const listeners: Array<(error: unknown) => void> = []
    const stopWatching = vi.fn()
    const renderBootFailure = vi.fn()
    const { calls, deps } = harness({
      router: {
        isReady: () => new Promise<void>(() => undefined),
        onError: (listener: (error: unknown) => void) => {
          listeners.push(listener)
          return stopWatching
        },
        afterEach: () => () => undefined,
        replace: vi.fn(),
        // No navigation has succeeded: the router still has no route.
        currentRoute: { value: START_LOCATION },
      } as never,
      startMocks: async () => {
        for (const listener of listeners) listener(failure)
      },
    })

    await expect(boot(root, { deps: { ...deps, renderBootFailure } })).resolves.toBeUndefined()

    expect(renderBootFailure).toHaveBeenCalledTimes(1)
    expect(renderBootFailure).toHaveBeenCalledWith(failure)
    expect(calls).not.toContain('app.mount')
    expect(stopWatching).toHaveBeenCalledTimes(1)
  })

  it('mounts when the router reported an error for a first navigation that succeeded', async () => {
    // vue-router sends a `scrollBehavior` that throws to `onError` after the
    // route has changed. The app has its first route; that is not a failed boot.
    const listeners: Array<(error: unknown) => void> = []
    const renderBootFailure = vi.fn()
    const { calls, deps } = harness({
      router: {
        isReady: async () => undefined,
        onError: (listener: (error: unknown) => void) => {
          listeners.push(listener)
          return () => undefined
        },
        afterEach: () => () => undefined,
        replace: vi.fn(),
        currentRoute: { value: { meta: {}, path: '/', fullPath: '/' } },
      } as never,
      startMocks: async () => {
        for (const listener of listeners) listener(new Error('scrollBehavior threw'))
      },
    })

    await boot(root, { deps: { ...deps, renderBootFailure } })

    expect(renderBootFailure).not.toHaveBeenCalled()
    expect(calls).toContain('app.mount')
  })

  describe('with a real router', () => {
    /** `boot()` is given a fake app, so the first navigation is started by hand. */
    function realRouter() {
      return createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', component: { render: () => null } },
          { path: '/refused', component: { render: () => null } },
          { path: '/broken', component: { render: () => null } },
        ],
      })
    }

    it('catches a first navigation a guard refused before boot got to waiting for it', async () => {
      // A guard that returns `false` is not an error to vue-router, so it never
      // reaches `onError`, and `isReady()` asked afterwards stays pending.
      const router = realRouter()
      router.beforeEach((to) => to.path !== '/refused')
      const renderBootFailure = vi.fn()
      const { calls, deps } = harness({
        router,
        startMocks: async () => {
          await router.push('/refused')
        },
      })

      await boot(root, { deps: { ...deps, renderBootFailure } })

      expect(renderBootFailure).toHaveBeenCalledTimes(1)
      const [reported] = renderBootFailure.mock.calls[0] as [unknown]
      expect(isNavigationFailure(reported, NavigationFailureType.aborted)).toBe(true)
      expect(calls).not.toContain('app.mount')
    })

    it('mounts when a first navigation failed and a later one succeeded before boot waited', async () => {
      const router = realRouter()
      router.beforeEach((to) => {
        if (to.path === '/broken') throw new Error('a guard threw')
      })
      const renderBootFailure = vi.fn()
      const { calls, deps } = harness({
        router,
        startMocks: async () => {
          await router.push('/broken').catch(() => undefined)
          await router.push('/')
        },
      })

      await boot(root, { deps: { ...deps, renderBootFailure } })

      expect(renderBootFailure).not.toHaveBeenCalled()
      expect(calls).toContain('app.mount')
    })

    it('still fails the boot when the only navigation there was threw', async () => {
      const failure = new Error('a guard threw')
      const router = realRouter()
      router.beforeEach(() => {
        throw failure
      })
      const renderBootFailure = vi.fn()
      const { calls, deps } = harness({
        router,
        startMocks: async () => {
          await router.push('/broken').catch(() => undefined)
        },
      })

      await boot(root, { deps: { ...deps, renderBootFailure } })

      expect(renderBootFailure).toHaveBeenCalledWith(failure)
      expect(calls).not.toContain('app.mount')
    })
  })

  it('does not run the steps after a failed demo seed', async () => {
    const failure = new Error('IndexedDB is unavailable')
    const renderBootFailure = vi.fn()
    const { calls, deps } = harness({
      loadDemoState: async () =>
        ({
          seedDemoSuperAdmin: () => Promise.reject(failure),
          getDemoSession: async () => null,
          onInvalidation: vi.fn(),
        }) as never,
    })

    await boot(root, { deps: { ...deps, renderBootFailure } })

    expect(renderBootFailure).toHaveBeenCalledWith(failure)
    expect(calls).not.toContain('restoreSession')
    expect(calls).not.toContain('app.mount')
  })

  it('logs and reports through the default renderBootFailure', async () => {
    // The real one, not a spy. Its screen is asserted in boot-error.test.ts;
    // what matters here is that boot() reaches it and that it does both jobs.
    const failure = new Error('setupModules blew up')
    const reporter = { name: 'test', captureException: vi.fn(), setUser: vi.fn() }
    installErrorReporter(reporter)
    const loggerError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    document.body.innerHTML = '<div id="app"></div><div id="app-loader"></div>'
    const { deps } = harness()

    try {
      await boot(root, {
        deps: {
          ...deps,
          renderBootFailure,
          setupModules: () => Promise.reject(failure),
        },
      })

      expect(loggerError).toHaveBeenCalledWith('Bootstrap failed:', { err: failure })
      expect(reporter.captureException).toHaveBeenCalledTimes(1)
      expect(reporter.captureException).toHaveBeenCalledWith(failure, { source: 'bootstrap' })
      // The visitor is not left under the splash.
      expect(document.getElementById('app-loader')).toBeNull()
      expect(document.getElementById('boot-failure')).not.toBeNull()
    } finally {
      resetErrorReporter()
      loggerError.mockRestore()
      document.body.innerHTML = ''
    }
  })

  it('shows the failure screen when a required module fails to install', async () => {
    // The real module registry, not a fake: this is the path the comment in
    // modules/index.ts promises ("re-thrown so boot() can show an error
    // screen").
    setActivePinia(createPinia())
    const failure = new Error('install failed')
    const required = {
      config: {
        id: 'needs-to-boot',
        name: 'Needs to boot',
        description: 'A required module whose install throws.',
        version: '1.0.0',
        category: 'core',
        required: true,
      },
      install: () => Promise.reject(failure),
    }
    const renderBootFailure = vi.fn()
    const { calls, deps } = harness()

    await boot(root, {
      deps: {
        ...deps,
        renderBootFailure,
        setupModules: (router, _modules, layoutMap) => setupModules(router, [required], layoutMap),
      },
    })

    expect(renderBootFailure).toHaveBeenCalledTimes(1)
    const [reported] = renderBootFailure.mock.calls[0] as [Error]
    expect(reported.message).toContain('Required module "needs-to-boot" failed to install')
    expect(reported.cause).toBe(failure)
    expect(calls).not.toContain('app.mount')
  })
})

describe('a failure while a stale-chunk reload is on its way', () => {
  const staleChunk = new TypeError('Failed to fetch dynamically imported module: /a-1.js')

  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  /** The first route's chunk is gone: the plugin handles it, and the router rejects. */
  function failingRouter(): Partial<BootDeps> {
    return {
      router: {
        isReady: () => {
          handleStaleChunkError(staleChunk, vi.fn())
          return Promise.reject(staleChunk)
        },
        onError: () => () => undefined,
        afterEach: () => () => undefined,
        replace: vi.fn(),
        currentRoute: { value: START_LOCATION },
      } as never,
    }
  }

  it('keeps the splash instead of flashing the failure screen before the reload', async () => {
    const renderBootFailure = vi.fn()
    const { deps } = harness()

    await boot(root, { deps: { ...deps, ...failingRouter(), renderBootFailure } })
    await vi.advanceTimersByTimeAsync(2000)

    expect(renderBootFailure).not.toHaveBeenCalled()
  })

  it('shows the failure screen after all when the reload never comes', async () => {
    const renderBootFailure = vi.fn()
    const { deps } = harness()

    await boot(root, { deps: { ...deps, ...failingRouter(), renderBootFailure } })
    await vi.advanceTimersByTimeAsync(10_000)

    expect(renderBootFailure).toHaveBeenCalledTimes(1)
    expect(renderBootFailure).toHaveBeenCalledWith(staleChunk)
  })

  it('shows the failure screen at once when the reload has already been spent', async () => {
    // The document before this one asked for the reload, and left its marker.
    handleStaleChunkError(staleChunk, vi.fn())
    const renderBootFailure = vi.fn()
    const { deps } = harness()

    await boot(root, { deps: { ...deps, ...failingRouter(), renderBootFailure } })

    expect(renderBootFailure).toHaveBeenCalledTimes(1)
    expect(renderBootFailure).toHaveBeenCalledWith(staleChunk)
  })
})

describe('a step after mount', () => {
  it('takes the splash down itself when removing it is the step that failed', async () => {
    const loggerError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    document.body.innerHTML = '<div id="app"></div><div id="app-loader"></div>'
    const renderBootFailure = vi.fn()
    const { calls, deps } = harness({
      removeAppLoader: () => {
        throw new Error('matchMedia is not a function')
      },
    })

    try {
      await boot(root, { deps: { ...deps, renderBootFailure } })

      expect(calls).toContain('app.mount')
      expect(renderBootFailure).not.toHaveBeenCalled()
      // The app is running: it must not be left underneath the spinner.
      expect(document.getElementById('app-loader')).toBeNull()
    } finally {
      loggerError.mockRestore()
      document.body.innerHTML = ''
    }
  })

  it('is reported but does not replace the running app with the failure screen', async () => {
    const failure = new Error('build info threw')
    const reporter = { name: 'test', captureException: vi.fn(), setUser: vi.fn() }
    installErrorReporter(reporter)
    const loggerError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
    const renderBootFailure = vi.fn()
    const { calls, deps } = harness({
      startBuildInfo: () => {
        throw failure
      },
    })

    try {
      await expect(boot(root, { deps: { ...deps, renderBootFailure } })).resolves.toBeUndefined()

      expect(calls).toContain('app.mount')
      expect(renderBootFailure).not.toHaveBeenCalled()
      expect(loggerError).toHaveBeenCalledWith('A step after mount failed:', { err: failure })
      expect(reporter.captureException).toHaveBeenCalledWith(failure, { source: 'bootstrap' })
    } finally {
      resetErrorReporter()
      loggerError.mockRestore()
    }
  })
})

describe('demo-only steps', () => {
  const DEMO_STEPS = ['loadDemoState', 'demo.seed', 'demo.startMocks', 'demo.onInvalidation']

  it('do not run when the build is not a demo build', async () => {
    vi.stubGlobal('__VUESTRATA_DEMO__', false)
    const { calls, deps } = harness()

    await boot(root, { deps })

    for (const step of DEMO_STEPS) expect(calls).not.toContain(step)
    // Everything that is not demo-only still ran.
    expect(calls).toContain('restoreSession')
    expect(calls).toContain('app.mount')
    expect(calls).toContain('startBuildInfo')
  })

  it('skips the seed and the tab sync for a real adapter, but still starts mocks when asked', async () => {
    const { calls, deps } = harness({ config: { authAdapter: 'jwt', useMocks: true } })

    await boot(root, { deps })

    expect(calls).not.toContain('demo.seed')
    expect(calls).not.toContain('demo.onInvalidation')
    expect(calls).toContain('demo.startMocks')
  })

  it('does not start the mock worker when mocks are switched off', async () => {
    const { calls, deps } = harness({ config: { authAdapter: 'mock', useMocks: false } })

    await boot(root, { deps })

    expect(calls).not.toContain('demo.startMocks')
    expect(calls).toContain('demo.seed')
  })
})

describe('installSeams', () => {
  afterEach(() => {
    __resetRuntimeSlots()
  })

  it('installs the API integration, and is safe to call twice', () => {
    __resetRuntimeSlots()
    expect(tryGetApiIntegration()).toBeNull()

    expect(() => {
      installSeams()
      installSeams()
    }).not.toThrow()

    // Read by the API client on every request; see test/unit/app/api-seam.test.ts.
    expect(tryGetApiIntegration()).toMatchObject({ timeoutMs: 15_000 })
  })
})
