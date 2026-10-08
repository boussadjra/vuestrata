import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { Router } from 'vue-router'

/**
 * The app built with `VUESTRATA_BASE_PATH=/console/`: what it asks the
 * browser for carries the prefix, and the paths it thinks in do not.
 *
 * The counterpart of base-path-default.test.ts, which pins the same things for
 * an app at the root.
 */

const BASE = '/console/'
const page = { render: () => null }

vi.mock('vue-router/auto-routes', () => ({
  routes: [
    { path: '/', component: page },
    { path: '/dashboard/customers', component: page },
    { path: '/auth/login', component: page },
    { path: '/docs/:slug(.*)*', component: page },
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
  vi.stubEnv('BASE_URL', BASE)
  window.history.replaceState({}, '', BASE)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.doUnmock('~/config/app.config')
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

describe('the router, under a base path', () => {
  async function loadRouter(): Promise<Router> {
    const { router } = await import('@/plugins/router')
    return router
  }

  it('writes the prefix into every link, and keeps it out of route paths', async () => {
    const router = await loadRouter()

    expect(router.options.history.base).toBe('/console')
    const resolved = router.resolve('/dashboard/customers')
    expect(resolved.path).toBe('/dashboard/customers')
    expect(resolved.href).toBe('/console/dashboard/customers')
    expect(router.resolve({ path: '/auth/login', query: { reason: 'expired' } }).href).toBe(
      '/console/auth/login?reason=expired',
    )
  })

  it('reads a deep link under the prefix as the route inside it', async () => {
    window.history.replaceState({}, '', '/console/dashboard/customers?page=2')
    const router = await loadRouter()

    // The location a page load starts from, which installing the router
    // navigates to: the prefix is gone before any route is matched.
    const start = router.options.history.location
    expect(start).toBe('/dashboard/customers?page=2')

    await router.replace(start)

    expect(router.currentRoute.value.path).toBe('/dashboard/customers')
    expect(router.currentRoute.value.fullPath).toBe('/dashboard/customers?page=2')
    expect(window.location.pathname).toBe('/console/dashboard/customers')
  })

  it('navigates under the prefix', async () => {
    const router = await loadRouter()

    await router.push('/dashboard/customers')

    expect(window.location.pathname).toBe('/console/dashboard/customers')
  })

  it('pushes a `redirect` value as a path inside the app, so the prefix is not doubled', async () => {
    const { safeRedirectPath } = await import('@/modules/auth/lib/safe-redirect')
    const router = await loadRouter()

    // What the route guard and the expiry redirect write: `route.fullPath`.
    await router.push(safeRedirectPath('/dashboard/customers'))
    expect(window.location.pathname).toBe('/console/dashboard/customers')

    // A hand-written link that tries another origin gets the fallback, which
    // is still inside the app.
    for (const hostile of ['//evil.example/x', '/\\evil.example', 'https://evil.example']) {
      const target = router.resolve(safeRedirectPath(hostile, '/'))
      expect(target.href).toBe('/console/')
    }
  })
})

describe('the deploy check, under a base path', () => {
  it('reads version.json from beside index.html, not from the root of the origin', async () => {
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
    expect(fetchMock).toHaveBeenCalledWith('/console/version.json', { cache: 'no-store' })
  })
})

describe('the docs locale lock before the router exists, under a base path', () => {
  it('recognises a docs page by its path inside the app', async () => {
    window.history.replaceState({}, '', '/console/docs/theming/overview')
    localStorage.setItem('vuestrata-locale', 'ar')
    const { bootstrapTheme } = await import('@/plugins/bootstrap-theme')

    bootstrapTheme()

    // Docs are English and left-to-right whatever the stored language is.
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('does not take a base path called /docs/ for the docs', async () => {
    vi.stubEnv('BASE_URL', '/docs/')
    window.history.replaceState({}, '', '/docs/dashboard')
    localStorage.setItem('vuestrata-locale', 'ar')
    const { bootstrapTheme } = await import('@/plugins/bootstrap-theme')

    bootstrapTheme()

    expect(document.documentElement.lang).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')
  })
})
