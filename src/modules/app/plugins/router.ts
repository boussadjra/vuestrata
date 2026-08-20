import NProgress from 'nprogress'
import { setupLayouts } from 'virtual:generated-layouts'
import {
  createRouter,
  createWebHistory,
  type RouteComponent,
  type RouteRecordRaw,
} from 'vue-router'
import { handleHotUpdate, routes } from 'vue-router/auto-routes'

import {
  LEGACY_COMPONENT_DOC_ROUTE_ENTRIES,
  resolveLegacyComponentsDocsPath,
} from '@/config/component-docs'
import DefaultLayout from '@/layouts/default.vue'
import { useAuthStore } from '@/stores/auth'
import type { Permission } from '~/types'

import { pinia } from './pinia'
import { resolveRouteAccess, type GuardedRoute } from './route-guard'
import { clearStaleChunkMarker, handleStaleChunkError } from './stale-chunk'

NProgress.configure({
  showSpinner: false,
  barSelector: '[data-role="bar"]',
  spinnerSelector: '[data-role="spinner"]',
  template: '<div class="bar" data-role="bar"><div class="peg"></div></div>',
})

function resolveStaticRoutes(fileRoutes: readonly RouteRecordRaw[]): RouteRecordRaw[] {
  return [
    // Compatibility redirect: /settings → /dashboard/settings
    { path: '/settings', redirect: '/dashboard/settings' },
    ...LEGACY_COMPONENT_DOC_ROUTE_ENTRIES.map(({ path, target }) => ({ path, redirect: target })),
    {
      path: '/components/:slug(.*)*',
      redirect: (to) => resolveLegacyComponentsDocsPath(to.path) ?? '/docs/components/overview',
    },
    ...(setupLayouts([...fileRoutes]) as RouteRecordRaw[]),
  ]
}

export const router = createRouter({
  history: createWebHistory(),
  routes: resolveStaticRoutes(routes),
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

if (import.meta.hot) {
  handleHotUpdate(router, (newRoutes) => {
    router.clearRoutes()
    for (const route of resolveStaticRoutes(newRoutes)) {
      router.addRoute(route)
    }
  })
}

router.beforeEach(() => {
  NProgress.start()
})
router.afterEach(() => {
  NProgress.done()
  // Chunks are loading again, so a LATER stale chunk (a second deploy in the
  // same session) should get its own reload rather than being suppressed by a
  // marker left over from this one.
  clearStaleChunkMarker()
})
router.onError((error) => {
  NProgress.done()
  // A route component that no longer exists on the server means a deploy
  // happened while this tab was open. Previously this handler tidied away the
  // progress bar and stopped there, so the user clicked a link and the app
  // silently refused to move — permanently, because the missing chunk never
  // comes back. See plugins/stale-chunk.ts for the reload-loop guard.
  handleStaleChunkError(error)
})

// Auth & RBAC guard.
//
// The decision logic lives in `route-guard.ts` as a pure function so it can be
// unit-tested without booting a router — it is the app's only client-side
// access control, and it previously had no direct test coverage at all. This
// hook only adapts the store and translates the decision into a navigation.
router.beforeEach((to) => {
  const authStore = useAuthStore(pinia)

  const decision = resolveRouteAccess(to as GuardedRoute, {
    isAuthenticated: authStore.isAuthenticated,
    role: authStore.userRole,
    permissions: authStore.userPermissions as Permission[] | undefined,
  })

  switch (decision.type) {
    case 'login':
      return { path: '/auth/login', query: { redirect: decision.redirect } }
    case 'forbidden':
      return { path: '/403' }
    default:
      return true
  }
})

/**
 * Layout components keyed by the `meta.layout` string used in module routes.
 * Keeping this co-located with the router ensures layout resolution stays in
 * the routing layer and never leaks into bootstrap or module infrastructure.
 *
 */
export const layoutMap: Record<string, RouteComponent> = {
  auth: () => import('@/layouts/auth.vue'),
  blank: () => import('@/layouts/blank.vue'),
  components: () => import('@/layouts/components.vue'),
  default: DefaultLayout,
  dashboard: () => import('@/layouts/dashboard.vue'),
  docs: () => import('@/layouts/docs.vue'),
}
