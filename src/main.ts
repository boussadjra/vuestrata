import { configure as configureFormwerk } from '@formwerk/core'

import { appConfig, authAdapter as configuredAuthAdapter } from '@/config/app.config'
import { installApiAuth, resetAuthInterceptor } from '@/lib/api/client'
// Utilities & error handling
import { installErrorHandlers, reportError } from '@/lib/errors'
import { logger } from '@/lib/logger'
// Modules
import { setupModules, useModuleStore } from '@/modules'
import { createAuthAdapter } from '@/modules/auth'
import { appModules } from '@/modules/setup'
import { bootstrapTheme } from '@/plugins/bootstrap-theme'
import { installErrorReporting } from '@/plugins/error-reporting'
import { installI18n } from '@/plugins/i18n'
// Plugins (initialization order matters)
import { pinia } from '@/plugins/pinia'
import { router, layoutMap } from '@/plugins/router'
import { restoreSession } from '@/plugins/session-restore'
import { VueQueryPlugin, vueQueryOptions } from '@/plugins/vue-query'
import { installRuntimeBackends } from '@/state/runtime-backends'
// Stores
import { useAuthStore } from '@/stores/auth'

// Root component
import App from './App.vue'

// Local styles
import '@/styles/app.css'

// Apply persisted dark/theme/locale/shape to <html> before any Vue code runs
// so the first paint already matches the user's preferences (no FOUC). After
// mount, `useThemeSync` / `useLocaleSync` / `useShapeSync` (in App.vue) keep the
// same DOM in sync with the store. Documentation URLs force English/LTR.
bootstrapTheme()

// Vuestrata relies on app/schema validation rather than browser-native HTML
// validation messages. Disabling Formwerk's HTML validation integration
// removes browser-locale warning noise and keeps feedback consistent.
configureFormwerk({ disableHtmlValidation: true })

// ─── Bootstrap helpers ────────────────────────────────────────────────────────

function setupVueErrorHandler(app: ReturnType<typeof createApp>): void {
  // Sole sink for Vue render-time errors. `reportError` is a no-op unless a
  // provider was installed by `installErrorReporting()` — keep reporters out of
  // components so this stays the one place errors leave the app.
  app.config.errorHandler = (err, instance, info) => {
    const component = instance?.$options?.name
    logger.error('Vue error:', { err, component, info })
    reportError(err, { source: 'vue:render', component, info })
  }
}

function setupAuthInterceptor(authStore: ReturnType<typeof useAuthStore>): void {
  installApiAuth({
    // The adapter decides whether the app sends a bearer token or relies on a
    // cookie session. The client previously did BOTH unconditionally.
    transport: createAuthAdapter(configuredAuthAdapter).transport,
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
      // Cookie-session adapters have no refresh token to rotate — the backend
      // renews the session itself — so there is nothing to do here.
      if (!adapter.capabilities.refresh || !adapter.refreshToken) return
      const result = await adapter.refreshToken(rt)
      if (authStore.user) {
        authStore.setAuth(authStore.user, result.token, result.refreshToken, result.expiresIn)
      }
    } catch (err) {
      logger.warn('Proactive token refresh failed — falling back to 401 interceptor', { err })
    }
  })
}

/**
 * Load the demo-state barrel.
 *
 * Every use is wrapped in `if (__VUESTRATA_DEMO__)` so rolldown removes the
 * `import()` — and with it the whole IndexedDB demo layer, the seeded
 * super-admin, and the demo credentials — from a production build. Importing
 * `~/state/demo-store` statically anywhere in application code would defeat
 * this; `scripts/build/verify-bundle.mjs --strict-demo` is what catches it.
 */
function loadDemoState() {
  return import('@/state/demo')
}

/**
 * Wire the real dependencies into `restoreSession`.
 *
 * The decision logic lives in `plugins/session-restore.ts` so it can be tested
 * without booting an app — see the note there about the `!authStore.token`
 * precondition that used to make the whole thing dead code.
 */
async function restoreSessionForBoot(authStore: ReturnType<typeof useAuthStore>): Promise<void> {
  const isDemoAuth = __VUESTRATA_DEMO__ && configuredAuthAdapter === 'mock'
  const adapter = createAuthAdapter(configuredAuthAdapter)

  await restoreSession({
    store: authStore,
    getUser: () => adapter.getUser(),
    resumeSession: adapter.resumeSession ? () => adapter.resumeSession!() : undefined,
    // Passing this is what selects the demo branch; the restore module needs
    // no build-mode constant of its own.
    loadDemoSession: isDemoAuth
      ? async () => {
          const { getDemoSession } = await loadDemoState()
          return (await getDemoSession()) ?? null
        }
      : undefined,
  })
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
  loader.style.pointerEvents = 'none'
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
  // Install the reporter BEFORE the global handlers so an error thrown during
  // the rest of bootstrap is still captured. No-op without a configured DSN.
  await installErrorReporting()
  installErrorHandlers()

  const app = createApp(App)
  setupVueErrorHandler(app)

  // useAuthStore must be called after app.use(pinia) — Pinia must be active first
  app.use(pinia)
  // Wire core/lib runtime backends (api-auth, rbac, validation cache).
  // Must happen after pinia (api-auth backend is a Pinia store) and before
  // any code path that reads from those backends (e.g. setupAuthInterceptor).
  installRuntimeBackends()
  const authStore = useAuthStore()
  setupAuthInterceptor(authStore)

  // Register plugins that module setup depends on.
  app.use(VueQueryPlugin, vueQueryOptions)
  installI18n(app)

  // Initialize feature modules and register their routes before installing
  // the router, so the first navigation sees the final route table.
  await setupModules(router, appModules, layoutMap)

  // Seed the demo super-admin — and top its grants back up on every boot.
  //
  // Runs AFTER setupModules() because a module's `config.permissions` only
  // reach the RBAC registry when the module registers. Seeding before that
  // produced a demo admin that held the built-in permissions and none of the
  // module-contributed ones, so the feature a module had just added was
  // missing from its sidebar and answered `/403`.
  //
  // It used to run inside installRuntimeBackends() with no guard at all,
  // writing a super-admin into IndexedDB in every environment.
  if (__VUESTRATA_DEMO__ && configuredAuthAdapter === 'mock') {
    const { seedDemoSuperAdmin } = await loadDemoState()
    await seedDemoSuperAdmin()
  }

  // After the seed, so a session restored from a previous visit carries the
  // reconciled permission set rather than the one captured at login.
  await restoreSessionForBoot(authStore)

  app.use(router)

  // Enable MSW when this is a demo build and mocks are switched on. Gating on
  // `__VUESTRATA_DEMO__` rather than `import.meta.env.DEV` is what makes the
  // hosted demo possible at all — the old DEV check meant MSW could never start
  // in a built artifact. The constant also lets rolldown drop this whole branch
  // (and the msw-vendor chunk) from a production build.
  //
  // Started AFTER setupModules so module-contributed handlers (e.g. the auth
  // module's mocks) are included alongside the static handler set.
  if (__VUESTRATA_DEMO__ && appConfig.useMocks) {
    const { startMockWorker } = await import('@/mocks/browser')
    const moduleStore = useModuleStore()
    await startMockWorker(await moduleStore.collectMockHandlers())
  }

  // Wait for router initialization before mounting
  await router.isReady()

  app.mount('#app')
  removeAppLoader()

  // Cross-tab demo session syncing. Entirely demo-only: it exists so signing
  // out in one tab clears the others, which real backends handle with a shared
  // cookie or a 401 on the next request.
  if (__VUESTRATA_DEMO__ && configuredAuthAdapter === 'mock') {
    const { getDemoSession, onInvalidation } = await loadDemoState()

    onInvalidation(async (event) => {
      if (event === 'update') {
        await restoreSessionForBoot(authStore)
        return
      }

      if (event === 'clear') {
        await clearDemoAuthTab(authStore)
      }
    })

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
