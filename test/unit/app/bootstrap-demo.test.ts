import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { removeAppLoader } from '@/bootstrap/app-loader'
import { clearDemoAuthTab, installDemoTabSync, type DemoState } from '@/bootstrap/demo'
import { startDemoMocks } from '@/bootstrap/mocks'
import { resetAuthInterceptor } from '@/lib/api/client'
import { startMockWorker } from '@/mocks/browser'
import { useModuleStore } from '@/modules'

/**
 * The demo-only and DOM-only steps `boot()` used to hold inline in `main.ts`.
 *
 * `boot()` is asserted against fakes for these (see bootstrap.test.ts), so what
 * they do themselves — which tab clears, when the poll fires, whether the
 * splash fades — was covered by nothing once the code moved.
 */

vi.mock('@/lib/api/client', () => ({ resetAuthInterceptor: vi.fn() }))
vi.mock('@/mocks/browser', () => ({ startMockWorker: vi.fn(async () => {}) }))
vi.mock('@/modules', () => ({ useModuleStore: vi.fn() }))

interface FakeRoute {
  path: string
  fullPath: string
  meta: { requiresAuth?: boolean }
}

function fakeRouter(route: FakeRoute) {
  return { currentRoute: { value: route }, replace: vi.fn(async () => undefined) }
}

const PROTECTED: FakeRoute = {
  path: '/dashboard/orders',
  fullPath: '/dashboard/orders?page=2',
  meta: { requiresAuth: true },
}
const PUBLIC: FakeRoute = { path: '/docs', fullPath: '/docs', meta: {} }

describe('clearDemoAuthTab', () => {
  beforeEach(() => vi.mocked(resetAuthInterceptor).mockClear())

  it('clears the session and sends a protected route to login, remembering where it was', async () => {
    const authStore = { clearAuth: vi.fn() }
    const router = fakeRouter(PROTECTED)

    await clearDemoAuthTab(authStore, router as never)

    expect(authStore.clearAuth).toHaveBeenCalledOnce()
    expect(resetAuthInterceptor).toHaveBeenCalledOnce()
    expect(router.replace).toHaveBeenCalledWith({
      path: '/auth/login',
      query: { redirect: '/dashboard/orders?page=2' },
    })
  })

  it('treats anything under /dashboard as protected, even without the meta flag', async () => {
    const router = fakeRouter({ path: '/dashboard', fullPath: '/dashboard', meta: {} })

    await clearDemoAuthTab({ clearAuth: vi.fn() }, router as never)

    expect(router.replace).toHaveBeenCalledWith({
      path: '/auth/login',
      query: { redirect: '/dashboard' },
    })
  })

  it('clears the session but leaves a public route where it is', async () => {
    const authStore = { clearAuth: vi.fn() }
    const router = fakeRouter(PUBLIC)

    await clearDemoAuthTab(authStore, router as never)

    expect(authStore.clearAuth).toHaveBeenCalledOnce()
    expect(resetAuthInterceptor).toHaveBeenCalledOnce()
    expect(router.replace).not.toHaveBeenCalled()
  })
})

describe('installDemoTabSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(resetAuthInterceptor).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function install(route: FakeRoute, session: unknown = { id: 'u1' }) {
    const authStore = { isAuthenticated: true, clearAuth: vi.fn() }
    const router = fakeRouter(route)
    const restore = vi.fn(async () => {})
    const state = {
      session,
      handlers: [] as Array<(event: string) => Promise<void>>,
    }
    const getDemoSession = vi.fn(async () => state.session)
    const load = vi.fn(async () => ({
      getDemoSession,
      onInvalidation: (handler: (event: string) => Promise<void>) =>
        void state.handlers.push(handler),
    })) as unknown as () => Promise<DemoState>

    await installDemoTabSync({ authStore, router: router as never, load, restore })

    /** What another tab's broadcast does here. */
    const emit = (event: string) => {
      const [handler] = state.handlers
      if (!handler) throw new Error('installDemoTabSync registered no invalidation handler')
      return handler(event)
    }

    return { authStore, router, restore, state, getDemoSession, emit }
  }

  it('restores the session when another tab updated it', async () => {
    const { emit, restore, authStore } = await install(PROTECTED)

    await emit('update')

    expect(restore).toHaveBeenCalledOnce()
    expect(authStore.clearAuth).not.toHaveBeenCalled()
  })

  it('clears this tab and goes to login when another tab signed out, from a protected route', async () => {
    const { emit, authStore, router } = await install(PROTECTED)

    await emit('clear')

    expect(authStore.clearAuth).toHaveBeenCalledOnce()
    expect(router.replace).toHaveBeenCalledWith({
      path: '/auth/login',
      query: { redirect: PROTECTED.fullPath },
    })
  })

  it('clears this tab and leaves it where it is when it was on a public route', async () => {
    const { emit, authStore, router } = await install(PUBLIC)

    await emit('clear')

    expect(authStore.clearAuth).toHaveBeenCalledOnce()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('ignores an event it does not know', async () => {
    const { emit, restore, authStore } = await install(PROTECTED)

    await emit('something-else')

    expect(restore).not.toHaveBeenCalled()
    expect(authStore.clearAuth).not.toHaveBeenCalled()
  })

  it('polls once a second and clears the tab when the session is gone', async () => {
    const { state, authStore, router, getDemoSession } = await install(PROTECTED)

    await vi.advanceTimersByTimeAsync(1000)
    expect(getDemoSession).toHaveBeenCalledTimes(1)
    expect(authStore.clearAuth).not.toHaveBeenCalled()

    state.session = null
    await vi.advanceTimersByTimeAsync(1000)

    expect(authStore.clearAuth).toHaveBeenCalledOnce()
    expect(router.replace).toHaveBeenCalledWith({
      path: '/auth/login',
      query: { redirect: PROTECTED.fullPath },
    })
  })

  it('does not read the session while nobody is signed in', async () => {
    const { authStore, getDemoSession } = await install(PROTECTED, null)
    authStore.isAuthenticated = false

    await vi.advanceTimersByTimeAsync(3000)

    expect(getDemoSession).not.toHaveBeenCalled()
    expect(authStore.clearAuth).not.toHaveBeenCalled()
  })

  it('stops polling when the page unloads', async () => {
    const { getDemoSession } = await install(PROTECTED)

    await vi.advanceTimersByTimeAsync(1000)
    expect(getDemoSession).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('beforeunload'))
    await vi.advanceTimersByTimeAsync(5000)

    expect(getDemoSession).toHaveBeenCalledTimes(1)
  })
})

describe('removeAppLoader', () => {
  const originalMatchMedia = window.matchMedia

  function reduceMotion(reduced: boolean) {
    window.matchMedia = vi.fn((query: string) => ({
      matches: reduced && query === '(prefers-reduced-motion: reduce)',
      media: query,
    })) as unknown as typeof window.matchMedia
  }

  function addLoader() {
    const loader = document.createElement('div')
    loader.id = 'app-loader'
    document.body.append(loader)
    return loader
  }

  beforeEach(() => vi.useFakeTimers())

  afterEach(() => {
    vi.useRealTimers()
    window.matchMedia = originalMatchMedia
    document.getElementById('app-loader')?.remove()
  })

  it('does nothing when the page has no splash', () => {
    expect(() => removeAppLoader()).not.toThrow()
  })

  it('removes the splash at once for a visitor who prefers reduced motion', () => {
    reduceMotion(true)
    const loader = addLoader()

    removeAppLoader()

    expect(loader.isConnected).toBe(false)
  })

  it('fades the splash out and removes it when the transition ends', () => {
    reduceMotion(false)
    const loader = addLoader()

    removeAppLoader()

    expect(loader.style.opacity).toBe('0')
    expect(loader.style.pointerEvents).toBe('none')
    expect(loader.isConnected).toBe(true)

    loader.dispatchEvent(new Event('transitionend'))
    expect(loader.isConnected).toBe(false)
  })

  it('removes it anyway when the transition never fires', () => {
    reduceMotion(false)
    const loader = addLoader()

    removeAppLoader()
    vi.advanceTimersByTime(499)
    expect(loader.isConnected).toBe(true)

    vi.advanceTimersByTime(1)
    expect(loader.isConnected).toBe(false)
  })
})

describe('startDemoMocks', () => {
  it('starts the worker with the handlers every module contributed', async () => {
    const handlers = [{ id: 'auth-login' }, { id: 'orders-list' }]
    const collectMockHandlers = vi.fn(async () => handlers)
    vi.mocked(useModuleStore).mockReturnValue({ collectMockHandlers } as never)

    await startDemoMocks()

    expect(collectMockHandlers).toHaveBeenCalledOnce()
    expect(startMockWorker).toHaveBeenCalledWith(handlers)
  })
})
