import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { isNavigationFailure, NavigationFailureType, type Router } from 'vue-router'

import { handleStaleChunkError } from '@/plugins/stale-chunk'

/**
 * When `plugins/router.ts` clears the stale-chunk marker.
 *
 * The marker is what stops a second automatic reload, so clearing it too
 * eagerly turns "one reload, then the error screen" into a reload on every
 * click. The rule lives in `router.afterEach`, which only a real router runs,
 * so this drives the real plugin over a route table of three empty pages.
 */

const page = { render: () => null }

vi.mock('vue-router/auto-routes', () => ({
  routes: [
    { path: '/', component: page },
    { path: '/next', component: page },
    { path: '/refused', component: page },
  ],
  handleHotUpdate: () => undefined,
}))
vi.mock('virtual:generated-layouts', () => ({ setupLayouts: (routes: unknown[]) => routes }))
vi.mock('@/layouts/default.vue', () => ({ default: page }))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ isAuthenticated: false, userRole: 'viewer', userPermissions: [] }),
}))

const MARKER_KEY = 'vuestrata-stale-chunk-reload'
const marker = () => sessionStorage.getItem(MARKER_KEY)

/** What a stale-chunk reload leaves behind for the document it comes back to. */
function leaveMarker(): void {
  handleStaleChunkError(new Error('Failed to fetch dynamically imported module'), vi.fn())
  expect(marker()).not.toBeNull()
}

/** The plugin's router, fresh, with the first navigation of a page load done. */
async function loadRouter(): Promise<Router> {
  vi.resetModules()
  window.history.replaceState({}, '', '/')
  const { router } = await import('@/plugins/router')
  await router.push('/')
  await router.isReady()
  return router
}

beforeEach(() => {
  sessionStorage.clear()
  // The router scrolls to the top after a navigation, which jsdom cannot do.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

describe('the stale-chunk marker', () => {
  it('survives the navigation a page load starts with', async () => {
    // That navigation is the reload coming back to the page the visitor was on.
    leaveMarker()

    await loadRouter()

    expect(marker()).not.toBeNull()
  })

  it('is cleared by the first navigation after it that arrives', async () => {
    const router = await loadRouter()
    leaveMarker()

    const failure = await router.push('/next')

    expect(failure).toBeUndefined()
    expect(router.currentRoute.value.path).toBe('/next')
    expect(marker()).toBeNull()
  })

  it('survives a navigation to the page already on screen', async () => {
    const router = await loadRouter()
    leaveMarker()

    const failure = await router.push('/')

    expect(isNavigationFailure(failure, NavigationFailureType.duplicated)).toBe(true)
    expect(marker()).not.toBeNull()
  })

  it('survives a navigation a guard refused', async () => {
    const router = await loadRouter()
    router.beforeEach((to) => to.path !== '/refused')
    leaveMarker()

    const failure = await router.push('/refused')

    expect(isNavigationFailure(failure, NavigationFailureType.aborted)).toBe(true)
    expect(router.currentRoute.value.path).toBe('/')
    expect(marker()).not.toBeNull()
  })
})
