import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { Router } from 'vue-router'

/**
 * What the APP does when no base path is set: every URL it builds for the
 * browser starts at the root of its origin.
 *
 * PINNED. Written before `VUESTRATA_BASE_PATH` existed; these assertions say
 * what the app did then and must keep doing for a project that sets nothing.
 * The OAuth redirect URI at the root is pinned the same way, on the wire, in
 * test/integration/auth/default-wire-contract.test.ts.
 */

const page = { render: () => null }

vi.mock('vue-router/auto-routes', () => ({
  routes: [
    { path: '/', component: page },
    { path: '/dashboard/customers', component: page },
  ],
  handleHotUpdate: () => undefined,
}))
vi.mock('virtual:generated-layouts', () => ({ setupLayouts: (routes: unknown[]) => routes }))
vi.mock('@/layouts/default.vue', () => ({ default: page }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ isAuthenticated: true, userRole: 'admin', userPermissions: [] }),
}))

beforeEach(() => {
  vi.resetModules()
  window.history.replaceState({}, '', '/')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.doUnmock('~/config/app.config')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the router, with no base path set', () => {
  async function loadRouter(): Promise<Router> {
    const { router } = await import('@/plugins/router')
    return router
  }

  it('has no base: a route path is the path in the address bar', async () => {
    const router = await loadRouter()

    expect(router.options.history.base).toBe('')
    expect(router.resolve('/dashboard/customers').href).toBe('/dashboard/customers')
    expect(router.resolve({ path: '/auth/login', query: { reason: 'expired' } }).href).toBe(
      '/auth/login?reason=expired',
    )
  })

  it('navigates to the path it was given', async () => {
    const router = await loadRouter()

    await router.push('/dashboard/customers')

    expect(window.location.pathname).toBe('/dashboard/customers')
  })
})

describe('the deploy check, with no base path set', () => {
  it('reads /version.json from the root of the origin', async () => {
    vi.doMock('~/config/app.config', () => ({ appConfig: { runtimeMode: 'production' } }))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'app',
        version: '1.0.0',
        release: 'abc',
        runtimeMode: 'production',
        buildTime: '',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { useBuildInfo } = await import('@/state/build-info')
    const stop = await useBuildInfo().start()
    stop()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/version.json', { cache: 'no-store' })
  })
})
