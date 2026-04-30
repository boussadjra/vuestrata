import { authAdapter as configuredAuthAdapter } from '@/config/app.config'
import { installApiAuth, resetAuthInterceptor } from '@/lib/api/client'
// Utilities & error handling
import { installErrorHandlers, normalizeError } from '@/lib/errors'
import { logger } from '@/lib/logger'
// Modules
import { setupModules, useModuleStore } from '@/modules'
import { createAuthAdapter } from '@/modules/auth'
import { appModules } from '@/modules/setup'
import { bootstrapTheme } from '@/plugins/bootstrap-theme'
import { installI18n } from '@/plugins/i18n'
// Plugins (initialization order matters)
import { pinia } from '@/plugins/pinia'
import { router, layoutMap } from '@/plugins/router'
import { VueQueryPlugin, vueQueryOptions } from '@/plugins/vue-query'
import { onInvalidation } from '@/state/demo-storage'
import { getDemoSession } from '@/state/demo-store'
import { installRuntimeBackends } from '@/state/runtime-backends'
// Stores
import { useAuthStore } from '@/stores/auth'

// Root component
import App from './App.vue'

// Local styles
import '@/styles/app.css'

// Apply persisted dark/theme/locale to <html> before any Vue code runs so the
// first paint already matches the user's preferences (no FOUC). After mount,
// `useThemeSync` (in App.vue) keeps the same DOM in sync with the store.
bootstrapTheme()

// ─── Bootstrap helpers ────────────────────────────────────────────────────────

function setupVueErrorHandler(app: ReturnType<typeof createApp>): void {
  // Sole sink for Vue render-time errors. When a real error-reporting
  // integration is added (Sentry, etc.) wire it here behind a feature
  // flag rather than sprinkling reporters across components.
  app.config.errorHandler = (err, instance, info) => {
    logger.error('Vue error:', {
      err,
      component: instance?.$options?.name,
      info,
    })
  }
}

function setupAuthInterceptor(authStore: ReturnType<typeof useAuthStore>): void {
  installApiAuth({
    getToken: () => authStore.token,
    getRefreshToken: () => authStore.refreshToken,
    setAuth: (token, refreshToken) => {
      const user = authStore.user
      if (!user) {
        logger.warn('Token refreshed but no user in store — discarding new token')
        return
      }
      authStore.setAuth(user, token, refreshToken)
    },
    clearAuth: () => {
      authStore.clearAuth()
      // Drop any in-flight refresh and the cooldown window so a fresh
      // login on the same page does not inherit the previous session's
      // interceptor state.
      resetAuthInterceptor()
    },
    onSessionExpired: () => {
      authStore.clearAuth()
      resetAuthInterceptor()
      router.replace({ name: '/auth/login' }).catch((err) => {
        logger.error('Redirect to login failed after session expiry', { err })
      })
    },
  })

  // Proactive token refresh: when the store schedules a refresh it delegates
  // to the adapter through this handler. Using the API client's refresh flow
  // keeps one code path for both reactive (on-401) and proactive refreshes.
  authStore.setRefreshHandler(async () => {
    const rt = authStore.refreshToken
    if (!rt) return
    try {
      const adapter = createAuthAdapter(configuredAuthAdapter)
      const result = await adapter.refreshToken(rt)
      if (authStore.user) {
        authStore.setAuth(authStore.user, result.token, result.refreshToken, result.expiresIn)
      }
    } catch (err) {
      logger.warn('Proactive token refresh failed — falling back to 401 interceptor', { err })
    }
  })
}

async function restoreSession(authStore: ReturnType<typeof useAuthStore>): Promise<void> {
  // Mock adapter: restore session from IndexedDB demo-store if available
  if (configuredAuthAdapter === 'mock') {
    const session = await getDemoSession()
    if (session) {
      authStore.setAuth(session.user, session.token, session.refreshToken, session.expiresIn)
    }
    return
  }
  if (!authStore.token) return
  try {
    const adapter = createAuthAdapter(configuredAuthAdapter)
    const user = await adapter.getUser()
    if (user) authStore.setUser(user)
  } catch (err) {
    // Only clear auth on hard credential failures (401/403). A transient
    // network blip, 5xx, or CORS hiccup should not log the user out — the
    // 401 interceptor will catch a truly-invalid token on the next request.
    const appErr = normalizeError(err)
    if (appErr.status === 401 || appErr.status === 403) {
      logger.warn('Session no longer valid — clearing auth', { status: appErr.status })
      authStore.clearAuth()
    } else {
      logger.warn('Session restoration failed (kept current state)', {
        code: appErr.code,
        status: appErr.status,
      })
    }
  }
}

function removeAppLoader(): void {
  const loader = document.getElementById('app-loader')
  if (!loader) return

  // Skip transition for users who prefer reduced motion.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    loader.remove()
    return
  }

  loader.style.opacity = '0'
  // { once: true } prevents a listener leak when the transition never fires.
  loader.addEventListener('transitionend', () => loader.remove(), { once: true })
  // Belt-and-suspenders: remove after the longest plausible transition time.
  setTimeout(() => loader.remove(), 500)
}

async function clearDemoAuthTab(authStore: ReturnType<typeof useAuthStore>): Promise<void> {
  const currentRoute = router.currentRoute.value
  const shouldRedirect =
    currentRoute.meta.requiresAuth === true || currentRoute.path.startsWith('/dashboard')

  authStore.clearAuth()
  resetAuthInterceptor()
  if (shouldRedirect) {
    await router.replace({
      path: '/auth/login',
      query: { redirect: currentRoute.fullPath },
    })
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function bootstrap() {
  installErrorHandlers()

  const app = createApp(App)
  setupVueErrorHandler(app)

  // useAuthStore must be called after app.use(pinia) — Pinia must be active first
  app.use(pinia)
  // Wire core/lib runtime backends (api-auth, rbac, validation cache).
  // Must happen after pinia (api-auth backend is a Pinia store) and before
  // any code path that reads from those backends (e.g. setupAuthInterceptor).
  await installRuntimeBackends()
  const authStore = useAuthStore()
  setupAuthInterceptor(authStore)

  // Register plugins that module setup depends on.
  app.use(VueQueryPlugin, vueQueryOptions)
  installI18n(app)

  await restoreSession(authStore)

  // Initialize feature modules and register their routes before installing
  // the router, so the first navigation sees the final route table.
  await setupModules(router, appModules, layoutMap)

  app.use(router)

  // Enable MSW for development if configured. Started AFTER setupModules so
  // module-contributed handlers (e.g. the auth module's mocks) are included
  // alongside the static handler set.
  if (import.meta.env.DEV && import.meta.env.VUESTRATA_USE_MOCKS === 'true') {
    const { startMockWorker } = await import('@/mocks/browser')
    const moduleStore = useModuleStore()
    await startMockWorker(moduleStore.collectMockHandlers())
  }

  // Wait for router initialization before mounting
  await router.isReady()

  app.mount('#app')
  removeAppLoader()

  // Listen for demo auth updates broadcast from other tabs so permissions and
  // session state refresh without a full page reload.
  onInvalidation(async (event) => {
    if (event === 'update') {
      await restoreSession(authStore)
      return
    }

    if (event === 'clear') {
      await clearDemoAuthTab(authStore)
    }
  })

  if (configuredAuthAdapter === 'mock') {
    const demoSessionPoll = window.setInterval(async () => {
      if (!authStore.isAuthenticated) return

      const session = await getDemoSession()
      if (!session) await clearDemoAuthTab(authStore)
    }, 1000)

    window.addEventListener('beforeunload', () => window.clearInterval(demoSessionPoll), {
      once: true,
    })
  }
}

bootstrap().catch((err) => {
  logger.error('Bootstrap failed:', { err })
})
