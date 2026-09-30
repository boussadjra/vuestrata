import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { App, Component } from 'vue'
import type { Router } from 'vue-router'

import { boot, type BootDeps } from '@/bootstrap'
import { renderBootFailure } from '@/bootstrap/boot-error'
import { installSeams } from '@/bootstrap/seams'
import type { createAuthAdapter } from '@/modules/auth'

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
    replace: vi.fn(),
    currentRoute: { value: { meta: {}, path: '/', fullPath: '/' } },
  } as unknown as Router
  tags.set(pinia, 'pinia')
  tags.set(router, 'router')

  const mount = vi.fn(() => void calls.push('app.mount'))
  const app = {
    config: {},
    use: vi.fn((plugin: unknown) => {
      calls.push(`app.use(${tags.get(plugin) ?? 'plugin'})`)
      return app
    }),
    mount,
  } as unknown as App

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

  return { calls, deps, app, mount, authStore, demo }
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
      (e) => ({ router: { isReady: () => Promise.reject(e), replace: vi.fn() } as never }),
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
    // The real one, not a spy: it must not throw, whatever it is handed.
    expect(() => renderBootFailure(new Error('boom'))).not.toThrow()
    expect(() => renderBootFailure('a string, not an Error')).not.toThrow()
    expect(() => renderBootFailure(undefined)).not.toThrow()
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
  it('is a no-op in this release, and safe to call twice', () => {
    expect(() => {
      installSeams()
      installSeams()
    }).not.toThrow()
  })
})
