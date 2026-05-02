import NProgress from 'nprogress'
import { setupLayouts } from 'virtual:generated-layouts'
import { defineAsyncComponent, type Component } from 'vue'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { handleHotUpdate, routes } from 'vue-router/auto-routes'

import { resolveLegacyComponentsDocsPath } from '@/config/component-docs'
import DefaultLayout from '@/layouts/default.vue'
import { useAuthStore } from '@/stores/auth'
import { createScopedLogger } from '~/lib/logger'
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  isRoleAtLeast,
  emitAuthorizationEvent,
} from '~/lib/rbac'
import type { Permission, Role } from '~/types'

import { pinia } from './pinia'

const routerLogger = createScopedLogger('router')

function resolveStaticRoutes(fileRoutes: readonly RouteRecordRaw[]): RouteRecordRaw[] {
  return [
    // Compatibility redirect: /settings → /dashboard/settings
    { path: '/settings', redirect: '/dashboard/settings' },
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

router.beforeEach((to) => {
  const docsPath = resolveLegacyComponentsDocsPath(to.path)
  if (!docsPath) return true

  return {
    path: docsPath,
    query: to.query,
    hash: to.hash,
    replace: true,
  }
})

router.beforeEach(() => {
  NProgress.start()
})
router.afterEach(() => {
  NProgress.done()
})
router.onError(() => {
  NProgress.done()
})

// Auth & RBAC guard
router.beforeEach((to) => {
  const authStore = useAuthStore(pinia)
  const requiresAuth = to.meta.requiresAuth === true

  if (requiresAuth && !authStore.isAuthenticated) {
    return { path: '/auth/login', query: { redirect: to.fullPath } }
  }
  if (authStore.isAuthenticated) {
    const userRole: Role = authStore.userRole
    const userPermissions = authStore.userPermissions

    // Check required role
    if (to.meta.requiredRole && !isRoleAtLeast(userRole, to.meta.requiredRole)) {
      return { path: '/403' }
    }

    // Resolve permission context for predicate evaluation
    let context: Record<string, unknown> | undefined
    if (to.meta.permissionContext) {
      try {
        context =
          typeof to.meta.permissionContext === 'function'
            ? (to.meta.permissionContext(to) ?? undefined)
            : to.meta.permissionContext
      } catch (err) {
        // Fail closed. A resolver that throws cannot be trusted to hand us
        // the data a predicate needs, and silently proceeding without the
        // context could grant access to a resource-scoped route on the base
        // role check alone — exactly the permission escalation the context
        // exists to prevent.
        routerLogger.error('permissionContext resolver threw', { path: to.fullPath, err })
        emitAuthorizationEvent({
          permission: 'permissionContext:resolver',
          granted: false,
          userRole,
          source: 'guard',
          context: {
            error: 'permissionContext resolver threw',
            path: to.fullPath,
          },
        })
        return { path: '/403' }
      }
    }

    // Multi-permission check (takes precedence over singular)
    if (to.meta.requiredPermissions?.length) {
      const mode = to.meta.permissionMode ?? 'all'
      const checkFn = mode === 'any' ? hasAnyPermission : hasAllPermissions
      if (
        !checkFn(
          userRole,
          userPermissions as Permission[] | undefined,
          to.meta.requiredPermissions,
          context,
          'guard',
        )
      ) {
        return { path: '/403' }
      }
    }
    // Singular permission check (backward-compatible)
    else if (to.meta.requiredPermission) {
      if (
        !hasPermission(
          userRole,
          userPermissions as Permission[] | undefined,
          to.meta.requiredPermission,
          context,
          'guard',
        )
      ) {
        return { path: '/403' }
      }
    }
  }

  return true
})

/**
 * Layout components keyed by the `meta.layout` string used in module routes.
 * Keeping this co-located with the router ensures layout resolution stays in
 * the routing layer and never leaks into bootstrap or module infrastructure.
 *
 */
export const layoutMap: Record<string, Component> = {
  auth: defineAsyncComponent(() => import('@/layouts/auth.vue')),
  blank: defineAsyncComponent(() => import('@/layouts/blank.vue')),
  components: defineAsyncComponent(() => import('@/layouts/components.vue')),
  default: DefaultLayout,
  dashboard: defineAsyncComponent(() => import('@/layouts/dashboard.vue')),
  docs: defineAsyncComponent(() => import('@/layouts/docs.vue')),
}
