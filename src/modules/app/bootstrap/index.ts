import { configure as configureFormwerk } from '@formwerk/core'
import type { VueQueryPluginOptions } from '@tanstack/vue-query'
import type { Pinia } from 'pinia'
import { createApp, type App, type Component } from 'vue'
import {
  isNavigationFailure,
  NavigationFailureType,
  START_LOCATION,
  type RouteComponent,
  type Router,
} from 'vue-router'

import { appConfig, authAdapter as configuredAuthAdapter } from '@/config/app.config'
import { loadAuthAdapter } from '@/lib/auth/registry'
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
import { noteStaleChunkReloadBaseline, pendingStaleChunkReloadMs } from './stale-chunk-reload'
import { installValidationMessages } from './validation-messages'

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
  /**
   * Makes the configured adapter buildable: fetches the module of one the
   * project registered to load on demand, and rejects for a name nothing
   * registered. A test that passes its own `createAuthAdapter` and a made-up
   * adapter name passes this too.
   */
  loadAuthAdapter: (adapterName: string) => Promise<void>
  installQuery: (app: App) => void
  installI18n: (app: App) => void
  /** Zod's messages, translated. Returns its own undo, which boot ignores. */
  installValidationMessages: () => unknown
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

/**
 * The replacements a caller really passed. A dependency given as `undefined`
 * means "use the default", not "remove the step": spread over the defaults as
 * it is, it would replace a working dependency with nothing, and the step that
 * calls it would throw.
 */
function definedDeps(deps: Partial<BootDeps> = {}): Partial<BootDeps> {
  return Object.fromEntries(Object.entries(deps).filter(([, value]) => value !== undefined))
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
    loadAuthAdapter,
    installQuery: (app) => app.use(VueQueryPlugin, options.queryOptions ?? vueQueryOptions),
    installI18n,
    installValidationMessages,
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
  // Sink for Vue render-time errors. `reportError` is a no-op unless a
  // provider was installed by `installErrorReporting()` — keep reporters out of
  // components so this stays the one place errors leave the app.
  //
  // One exception: `AppErrorBoundary` returns `false` from `onErrorCaptured` for
  // the fatal errors it shows a screen for, which stops Vue calling this, so it
  // reports those itself (source `vue:boundary`).
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
 * `renderBootFailure()`, which replaces the splash with a static error screen;
 * `boot()` itself never rejects. A step that fails after the app has mounted is
 * only logged and reported.
 *
 * One failure is outside both this and the error boundary: the root component's
 * own `setup()`. Vue hands it to `app.config.errorHandler` and `mount()` returns
 * normally, so it is logged and reported, and the page is empty. `AppRoot.vue`
 * is kept to wiring for that reason; anything that can fail belongs below the
 * boundary it renders.
 */
export async function boot(root: Component, options: BootOptions = {}): Promise<void> {
  const deps: BootDeps = { ...defaultDeps(options), ...definedDeps(options.deps) }
  const progress: BootProgress = { mounted: false }

  try {
    await runBoot(root, options, deps, progress)
  } catch (err) {
    if (progress.mounted) {
      // The app is up and usable. A step that runs after mount (build info,
      // the demo tab sync) is a nicety, and `renderBootFailure()` replaces the
      // whole of #app: showing it here would take a working app away.
      logger.error('A step after mount failed:', { err })
      reportError(err, { source: 'bootstrap' })
      // Taking the splash down is itself a step after mount. If that is the one
      // that failed, the app is running underneath a spinner.
      try {
        removeAppLoader({ immediate: true })
      } catch {
        // Nothing else can be done about it.
      }
      return
    }
    // When the first route's chunk is missing, `plugins/stale-chunk.ts` asks for
    // a reload and the navigation fails all the same, which is how boot gets
    // here. The page is about to be replaced: keep the splash rather than flash
    // a failure screen in front of the fix. The timer only fires if the reload
    // never comes.
    const wait = pendingStaleChunkReloadMs()
    if (wait > 0) setTimeout(() => deps.renderBootFailure(err), wait)
    else deps.renderBootFailure(err)
  }
}

/**
 * `router.isReady()`, without its blind spot.
 *
 * vue-router rejects `isReady()` only for callers that are already waiting when
 * the first navigation fails. `boot()` has work to do between installing the
 * router and waiting for it (starting the mock worker, in a demo build), and a
 * first navigation that failed during that work left `isReady()` pending for
 * ever: no error, no mount, and the splash spinner turning until the tab was
 * closed. The failure is remembered here instead, from the moment the router is
 * installed, and thrown when `boot()` gets round to asking.
 *
 * Two kinds are remembered, the two `isReady()` rejects for when it is already
 * waiting: an error (a chunk that could not be fetched, a guard that threw) and
 * a navigation a guard refused by returning `false`, which vue-router reports
 * to `afterEach` and not to `onError`.
 *
 * A remembered failure only counts while the router still has no route. If it
 * has one, a navigation succeeded: either a later one, or the very one the
 * "failure" belongs to, because vue-router sends a `scrollBehavior` that throws
 * to `onError` after the route has changed.
 */
function watchFirstNavigation(router: Router): { settled: () => Promise<void> } {
  const outcome: { failure?: { error: unknown } } = {}
  const stopWatching = [
    router.onError((error) => {
      outcome.failure ??= { error }
    }),
    router.afterEach((_to, _from, failure) => {
      if (isNavigationFailure(failure, NavigationFailureType.aborted)) {
        outcome.failure ??= { error: failure }
      }
    }),
  ]

  return {
    async settled() {
      try {
        if (outcome.failure && router.currentRoute.value === START_LOCATION) {
          throw outcome.failure.error
        }
        await router.isReady()
      } finally {
        for (const stop of stopWatching) stop()
      }
    },
  }
}

/** What `runBoot()` has got done, so `boot()` knows what a failure can still undo. */
interface BootProgress {
  mounted: boolean
}

async function runBoot(
  root: Component,
  options: BootOptions,
  deps: BootDeps,
  progress: BootProgress,
): Promise<void> {
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
  // tab was open is recovered rather than surfacing as a dead navigation. The
  // baseline comes first: it is how a reload this document asks for is told
  // from the one that brought it here.
  noteStaleChunkReloadBaseline()
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
  // After the seams, which is where the project's own adapters are registered,
  // and before anything builds one. Awaited because an adapter can be a lazy
  // chunk (an SDK only the deployment that selects it should download); for a
  // built-in adapter it resolves at once. An unknown name rejects here and
  // boot shows the failure screen: there is no adapter to fall back to that
  // would not be the wrong one.
  await deps.loadAuthAdapter(config.authAdapter)
  const authStore = deps.useAuthStore()
  setupAuthInterceptor(authStore, { ...wiring, router })

  // Register plugins that module setup depends on.
  deps.installQuery(app)
  deps.installI18n(app)
  // Zod's messages come from the locale catalog from here on. After i18n,
  // which it translates through, and before module setup, so nothing a module
  // validates while it registers is described in zod's English.
  deps.installValidationMessages()

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
  //
  // The adapter is the second half of the condition on purpose. A demo build
  // that mocks only some modules beside a real backend (`VUESTRATA_MOCK_ONLY`)
  // has MSW in it and a real adapter: its users are the backend's, and it gets
  // no seeded admin, no demo session and no tab sync below.
  if (__VUESTRATA_DEMO__ && config.authAdapter === 'mock') {
    const { seedDemoSuperAdmin } = await (deps.loadDemoState ?? loadDemoState)()
    await seedDemoSuperAdmin()
  }

  // After the seed, so a session restored from a previous visit carries the
  // reconciled permission set rather than the one captured at login.
  await restore(authStore)

  // Installing the router starts the first navigation, so the watch has to be
  // in place before it.
  const firstNavigation = watchFirstNavigation(router)
  app.use(router)

  // Enable MSW when this is a demo build and mocks are switched on. Gating on
  // `__VUESTRATA_DEMO__` rather than `import.meta.env.DEV` is what makes the
  // hosted demo possible at all — the old DEV check meant MSW could never start
  // in a built artifact. The constant also lets rolldown drop this whole branch
  // (and the msw-vendor chunk) from a production build.
  //
  // Started AFTER setupModules so module-contributed handlers (e.g. the auth
  // module's mocks) are included alongside the static handler set.
  //
  // Which handlers start is `startDemoMocks()`'s to decide: all of them in the
  // demo, or the ones `VUESTRATA_MOCK_ONLY` lists, beside a real backend. The
  // session was restored above, before any worker existed, so a real adapter's
  // refresh went to that backend without passing through one.
  if (__VUESTRATA_DEMO__ && config.useMocks) {
    await (deps.startMocks ?? startDemoMocks)()
  }

  // Wait for router initialization before mounting
  await firstNavigation.settled()

  await options.beforeMount?.(app)
  app.mount('#app')
  progress.mounted = true
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
