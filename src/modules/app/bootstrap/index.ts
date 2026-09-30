import { configure as configureFormwerk } from '@formwerk/core'
import type { VueQueryPluginOptions } from '@tanstack/vue-query'
import type { Pinia } from 'pinia'
import { createApp, type App, type Component } from 'vue'
import type { RouteComponent, Router } from 'vue-router'

import { appConfig, authAdapter as configuredAuthAdapter } from '@/config/app.config'
import { installErrorHandlers, reportError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { setupModules } from '@/modules'
import { createAuthAdapter } from '@/modules/auth'
import { appModules } from '@/modules/setup'
import { bootstrapTheme } from '@/plugins/bootstrap-theme'
import { installErrorReporting } from '@/plugins/error-reporting'
import { installI18n } from '@/plugins/i18n'
import { installPerformanceMonitoring } from '@/plugins/observability'
import { pinia } from '@/plugins/pinia'
import { router, layoutMap } from '@/plugins/router'
import { restoreSession } from '@/plugins/session-restore'
import { installStaleChunkRecovery } from '@/plugins/stale-chunk'
import { useBuildInfo } from '@/state/build-info'
import { installRuntimeBackends } from '@/state/runtime-backends'
import { useAuthStore } from '@/stores/auth'

import { removeAppLoader } from './app-loader'
import { restoreSessionForBoot, setupAuthInterceptor, type AuthWiringStore } from './auth-wiring'
import { renderBootFailure } from './boot-error'
import { installDemoTabSync, loadDemoState, type DemoState } from './demo'
import { startDemoMocks } from './mocks'
import { VueQueryPlugin, vueQueryOptions } from './query-client'
import { installSeams } from './seams'

/**
 * Everything `boot()` calls that touches the outside world.
 *
 * The defaults are the real thing. A test replaces the heavy ones — the router,
 * the module registry, the adapters — with fakes, which is the only way to
 * assert the ORDER of the boot sequence without booting an application. The
 * demo-only entries are optional and have no default here on purpose: their
 * defaults are resolved inside the `__VUESTRATA_DEMO__` branches below, which
 * is what keeps the demo layer out of a production bundle.
 */
export interface BootDeps {
  bootstrapTheme: () => void
  configureFormwerk: (config: { disableHtmlValidation: boolean }) => void
  installErrorReporting: () => Promise<void>
  installPerformanceMonitoring: () => void
  installErrorHandlers: () => void
  installStaleChunkRecovery: () => void
  createApp: (root: Component) => App
  pinia: Pinia
  installRuntimeBackends: () => void
  installSeams: () => void
  useAuthStore: () => AuthWiringStore
  createAuthAdapter: typeof createAuthAdapter
  installQuery: (app: App) => void
  installI18n: (app: App) => void
  setupModules: (
    router: Router,
    modules: typeof appModules,
    layoutMap: Record<string, RouteComponent>,
  ) => Promise<void>
  appModules: typeof appModules
  router: Router
  layoutMap: Record<string, RouteComponent>
  restoreSession: typeof restoreSession
  removeAppLoader: () => void
  startBuildInfo: () => void
  renderBootFailure: (err: unknown) => void
  /** `VUESTRATA_AUTH_ADAPTER` and `VUESTRATA_USE_MOCKS`, as configured. */
  config: { authAdapter: string; useMocks: boolean }
  /** Demo builds only. */
  loadDemoState?: () => Promise<DemoState>
  /** Demo builds only. */
  startMocks?: () => Promise<void>
}

export interface BootOptions {
  /**
   * Called once the router is ready and every plugin is installed, just before
   * the app mounts. The place for a project's own `app.use(...)`,
   * `app.directive(...)` and `app.provide(...)`, so `main.ts` never has to be
   * anything but `boot(App)`.
   */
  beforeMount?: (app: App) => void | Promise<void>
  /**
   * Replaces the query client options wholesale, including the retry policy
   * in `bootstrap/query-client.ts`. Spread `vueQueryOptions` (exported there)
   * to change one setting and keep the rest.
   */
  queryOptions?: VueQueryPluginOptions
  /** Replace any dependency. Meant for tests; production code passes nothing. */
  deps?: Partial<BootDeps>
}

function defaultDeps(options: BootOptions): BootDeps {
  return {
    bootstrapTheme,
    configureFormwerk,
    installErrorReporting,
    installPerformanceMonitoring,
    installErrorHandlers,
    installStaleChunkRecovery,
    createApp,
    pinia,
    installRuntimeBackends,
    installSeams,
    useAuthStore,
    createAuthAdapter,
    installQuery: (app) => app.use(VueQueryPlugin, options.queryOptions ?? vueQueryOptions),
    installI18n,
    setupModules,
    appModules,
    router,
    layoutMap,
    restoreSession,
    removeAppLoader,
    // After mount: this is a background nicety and must never sit on the path
    // to first paint. No-op in demo mode.
    startBuildInfo: () => void useBuildInfo().start(),
    renderBootFailure,
    config: { authAdapter: configuredAuthAdapter, useMocks: appConfig.useMocks },
  }
}

function setupVueErrorHandler(app: App): void {
  // Sole sink for Vue render-time errors. `reportError` is a no-op unless a
  // provider was installed by `installErrorReporting()` — keep reporters out of
  // components so this stays the one place errors leave the app.
  app.config.errorHandler = (err, instance, info) => {
    const component = instance?.$options?.name
    logger.error('Vue error:', { err, component, info })
    reportError(err, { source: 'vue:render', component, info })
  }
}

/**
 * Boot the application: install everything, then mount `root` on `#app`.
 *
 * The order is the contract, and each step's comment says why it sits where it
 * does. A step that throws stops the sequence and hands the error to
 * `renderBootFailure()`; `boot()` itself never rejects.
 */
export async function boot(root: Component, options: BootOptions = {}): Promise<void> {
  const deps: BootDeps = { ...defaultDeps(options), ...options.deps }

  try {
    await runBoot(root, options, deps)
  } catch (err) {
    deps.renderBootFailure(err)
  }
}

async function runBoot(root: Component, options: BootOptions, deps: BootDeps): Promise<void> {
  const { router, config } = deps
  const wiring = { adapterName: config.authAdapter, createAuthAdapter: deps.createAuthAdapter }
  const restore = (authStore: AuthWiringStore) =>
    restoreSessionForBoot(authStore, {
      ...wiring,
      restoreSession: deps.restoreSession,
      loadDemoState: deps.loadDemoState,
    })

  // Apply persisted dark/theme/locale/shape to <html> before any Vue code runs
  // so the first paint already matches the user's preferences (no FOUC). After
  // mount, `useThemeSync` / `useLocaleSync` / `useShapeSync` (in AppRoot.vue)
  // keep the same DOM in sync with the store. Documentation URLs force
  // English/LTR.
  deps.bootstrapTheme()

  // Vuestrata relies on app/schema validation rather than browser-native HTML
  // validation messages. Disabling Formwerk's HTML validation integration
  // removes browser-locale warning noise and keeps feedback consistent.
  deps.configureFormwerk({ disableHtmlValidation: true })

  // Install the reporter BEFORE the global handlers so an error thrown during
  // the rest of bootstrap is still captured. No-op without a configured DSN.
  await deps.installErrorReporting()
  deps.installPerformanceMonitoring()
  deps.installErrorHandlers()
  // Before any lazy route can be requested, so a deploy that landed while this
  // tab was open is recovered rather than surfacing as a dead navigation.
  deps.installStaleChunkRecovery()

  const app = deps.createApp(root)
  setupVueErrorHandler(app)

  // useAuthStore must be called after app.use(pinia) — Pinia must be active first
  app.use(deps.pinia)
  // Wire core/lib runtime backends (api-auth, rbac, validation cache).
  // Must happen after pinia (api-auth backend is a Pinia store) and before
  // any code path that reads from those backends (e.g. setupAuthInterceptor).
  deps.installRuntimeBackends()
  // Read the project's seeded config files into core/lib. Right after the
  // backends, so a seam can register into them, and before anything below
  // reads an API client, a role or a permission.
  deps.installSeams()
  const authStore = deps.useAuthStore()
  setupAuthInterceptor(authStore, { ...wiring, router })

  // Register plugins that module setup depends on.
  deps.installQuery(app)
  deps.installI18n(app)

  // Initialize feature modules and register their routes before installing
  // the router, so the first navigation sees the final route table.
  await deps.setupModules(router, deps.appModules, deps.layoutMap)

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
  if (__VUESTRATA_DEMO__ && config.authAdapter === 'mock') {
    const { seedDemoSuperAdmin } = await (deps.loadDemoState ?? loadDemoState)()
    await seedDemoSuperAdmin()
  }

  // After the seed, so a session restored from a previous visit carries the
  // reconciled permission set rather than the one captured at login.
  await restore(authStore)

  app.use(router)

  // Enable MSW when this is a demo build and mocks are switched on. Gating on
  // `__VUESTRATA_DEMO__` rather than `import.meta.env.DEV` is what makes the
  // hosted demo possible at all — the old DEV check meant MSW could never start
  // in a built artifact. The constant also lets rolldown drop this whole branch
  // (and the msw-vendor chunk) from a production build.
  //
  // Started AFTER setupModules so module-contributed handlers (e.g. the auth
  // module's mocks) are included alongside the static handler set.
  if (__VUESTRATA_DEMO__ && config.useMocks) {
    await (deps.startMocks ?? startDemoMocks)()
  }

  // Wait for router initialization before mounting
  await router.isReady()

  await options.beforeMount?.(app)
  app.mount('#app')
  deps.removeAppLoader()

  deps.startBuildInfo()

  // Cross-tab demo session syncing. Entirely demo-only: it exists so signing
  // out in one tab clears the others, which real backends handle with a shared
  // cookie or a 401 on the next request.
  if (__VUESTRATA_DEMO__ && config.authAdapter === 'mock') {
    await installDemoTabSync({
      authStore,
      router,
      load: deps.loadDemoState ?? loadDemoState,
      restore: () => restore(authStore),
    })
  }
}
