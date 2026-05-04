import { defineStore } from 'pinia'
import type { Router } from 'vue-router'

import { createJsonSerializer, useAppStorage } from '~/composables/useAppStorage'
import { createScopedLogger } from '~/lib/logger'
import { registerPermissions, validateBuiltinRolePermissions } from '~/lib/rbac'

import { loadModuleTranslations } from './i18n'
import type { ModuleDefinition, ModuleConfig, ModuleNavItem, ModuleRoute } from './types'

// ─── Module Store ─────────────────────────────────────────

const moduleLogger = createScopedLogger('modules')
const STORAGE_KEY = 'vuestrata-enabled-modules'

export const useModuleStore = defineStore('modules', () => {
  // ─── State ────────────────────────────────────────────────

  const registry = ref(new Map<string, ModuleDefinition>())
  const enabledStorage = useAppStorage<string[]>(STORAGE_KEY, [], {
    serializer: createJsonSerializer<string[]>([]),
    validate: (value) => Array.isArray(value) && value.every((entry) => typeof entry === 'string'),
    fallback: [],
  })
  const enabledIds = ref<Set<string>>(new Set(enabledStorage.value))

  // Mirror persisted ids into the in-memory Set. `enabledStorage` is itself
  // a ref<string[]> so a shallow watch is enough — the array reference
  // changes whenever the value is reassigned (cross-tab sync, manual edits).
  watch(enabledStorage, (value) => {
    enabledIds.value = new Set(value)
  })

  function syncEnabled() {
    enabledStorage.value = [...enabledIds.value]
  }

  // Track in-flight enable() calls so concurrent requests for the same id
  // (or for two modules whose dependency graphs intersect) do not cause
  // duplicate `install()` invocations.
  const enabling = new Map<string, Promise<void>>()

  // ─── Getters ──────────────────────────────────────────────

  /** All registered module definitions (read-only) */
  const allModules = computed<ReadonlyMap<string, ModuleDefinition>>(() => registry.value)

  /** Set of enabled module IDs (read-only) */
  const enabledModules = computed<ReadonlySet<string>>(() => enabledIds.value)

  /** Enabled module definitions, sorted by category + order */
  const activeModules = computed(() => {
    const active: ModuleDefinition[] = []
    for (const [id, mod] of registry.value) {
      if (enabledIds.value.has(id)) active.push(mod)
    }
    return active.sort(
      (a, b) =>
        a.config.category.localeCompare(b.config.category) ||
        (a.config.order ?? 99) - (b.config.order ?? 99),
    )
  })

  /** Aggregated routes from all enabled modules */
  const routes = computed<ModuleRoute[]>(() => {
    const r: ModuleRoute[] = []
    for (const mod of activeModules.value) {
      if (mod.routes?.length) r.push(...mod.routes)
    }
    return r
  })

  /** Aggregated nav items from all enabled modules, sorted by order */
  const navItems = computed<ModuleNavItem[]>(() => {
    const items: ModuleNavItem[] = []
    for (const mod of activeModules.value) {
      if (mod.navItems?.length) items.push(...mod.navItems)
    }
    return items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
  })

  /** Module configs grouped by category */
  const modulesByCategory = computed(() => {
    const grouped = new Map<string, ModuleConfig[]>()
    for (const [, mod] of registry.value) {
      const cat = mod.config.category
      if (!grouped.has(cat)) grouped.set(cat, [])
      grouped.get(cat)!.push(mod.config)
    }
    return grouped
  })

  // ─── Actions ──────────────────────────────────────────────

  /**
   * Register a module definition.
   * Does NOT enable it — call `enableModule()` separately.
   */
  function registerModule(definition: ModuleDefinition): void {
    if (registry.value.has(definition.config.id)) {
      moduleLogger.warn(`Module "${definition.config.id}" is already registered.`)
      return
    }
    registry.value.set(definition.config.id, definition)

    // Register module-contributed permissions with the RBAC registry
    if (definition.config.permissions?.length) {
      registerPermissions(definition.config.id, definition.config.permissions)
    }
  }

  /**
   * Register multiple modules at once.
   */
  function registerModules(definitions: ModuleDefinition[]): void {
    for (const def of definitions) {
      registerModule(def)
    }
  }

  /**
   * Enable a module by id. Resolves dependencies automatically.
   * Concurrent calls for the same id share a single promise so `install()`
   * runs at most once. On install failure the module is rolled back out of
   * the enabled set and the rejection is propagated to the caller.
   *
   * `_visiting` is internal and tracks the dependency chain currently being
   * resolved so a cycle (A → B → A) throws a typed error instead of blowing
   * the call stack.
   */
  async function enableModule(id: string, _visiting: Set<string> = new Set()): Promise<void> {
    const mod = registry.value.get(id)
    if (!mod) {
      moduleLogger.warn(`Module "${id}" is not registered.`)
      return
    }
    if (enabledIds.value.has(id)) return

    if (_visiting.has(id)) {
      // Slice from the first occurrence of `id` so the message names only the
      // actual cycle (A → B → A) rather than the full visit history that led
      // here (caller → ... → A → B → A).
      const visited = [..._visiting]
      const start = visited.indexOf(id)
      const cycle = [...visited.slice(start), id].join(' → ')
      throw new Error(`Circular module dependency detected: ${cycle}`)
    }

    const inflight = enabling.get(id)
    if (inflight) return inflight

    const run = (async () => {
      // Enable dependencies first
      if (mod.config.dependencies?.length) {
        const nextVisiting = new Set(_visiting).add(id)
        for (const depId of mod.config.dependencies) {
          if (!enabledIds.value.has(depId)) {
            await enableModule(depId, nextVisiting)
          }
        }
      }

      // Run install() first; only mark the module enabled once it resolves so
      // computeds (`activeModules`, `routes`, `navItems`) never expose a
      // half-installed module. Concurrent enable() calls for the same id are
      // already deduplicated by the `enabling` map below, so we don't need an
      // early `add()` for short-circuiting.
      if (mod.install) await mod.install()
      enabledIds.value.add(id)
      syncEnabled()
    })()

    enabling.set(id, run)
    try {
      await run
    } finally {
      enabling.delete(id)
    }
  }

  /**
   * Disable a module by id. Refuses to disable modules marked `required` and
   * warns if other enabled modules depend on this one.
   */
  function disableModule(id: string): void {
    if (!enabledIds.value.has(id)) return

    const mod = registry.value.get(id)

    // Required modules are platform infrastructure — never disable.
    if (mod?.config.required) {
      moduleLogger.error(
        `Cannot disable "${id}" — module is marked as required platform infrastructure.`,
      )
      return
    }

    // Check if any enabled module depends on this one
    for (const [otherId, otherMod] of registry.value) {
      if (enabledIds.value.has(otherId) && otherMod.config.dependencies?.includes(id)) {
        moduleLogger.warn(`Cannot disable "${id}" — module "${otherId}" depends on it.`)
        return
      }
    }

    if (mod?.uninstall) mod.uninstall()
    enabledIds.value.delete(id)
    syncEnabled()
  }

  /**
   * Get a registered module definition.
   */
  function getModule(id: string): ModuleDefinition | undefined {
    return registry.value.get(id)
  }

  /**
   * Initialize the module system: register modules and enable persisted/default ones.
   */
  async function initModules(definitions: ModuleDefinition[]): Promise<void> {
    registerModules(definitions)
    loadModuleTranslations(definitions)

    // Validate that every permission referenced in built-in role definitions
    // is now registered. Running this AFTER module registration (rather than
    // at RBAC-barrel import time) means modules have a chance to add their
    // own permissions first, so the warning only surfaces real typos.
    const invalid = validateBuiltinRolePermissions()
    if (invalid.length > 0) {
      moduleLogger.warn(
        `RBAC validation found ${invalid.length} unregistered permission(s) referenced by roles: ${invalid.join(', ')}`,
      )
    }

    const persisted = new Set(enabledStorage.value)
    const required = definitions.filter((d) => d.config.required).map((d) => d.config.id)
    const defaults = definitions.filter((d) => d.config.enabledByDefault).map((d) => d.config.id)
    const toEnable = new Set([...required, ...(persisted.size > 0 ? persisted : defaults)])

    // Continue enabling siblings even if an optional one fails so a single
    // broken module can't take the whole app offline. Required modules
    // (e.g. auth) are platform infrastructure — their install failures are
    // fatal and re-thrown so `bootstrap()` can show an error screen instead
    // of silently rendering a half-working UI.
    const failures: Array<{ id: string; err: unknown }> = []
    for (const id of toEnable) {
      try {
        await enableModule(id)
      } catch (err) {
        failures.push({ id, err })
        moduleLogger.error(`Failed to enable module "${id}"`, { err })
        const def = registry.value.get(id)
        if (def?.config.required) {
          throw new Error(
            `Required module "${id}" failed to install: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err },
          )
        }
      }
    }
    if (failures.length > 0) {
      moduleLogger.warn(
        `${failures.length} module(s) failed to initialize: ${failures.map((f) => f.id).join(', ')}`,
      )
    }
  }

  /**
   * Collect all MSW mock handlers from enabled modules (dev only).
   */
  function collectMockHandlers(): unknown[] {
    const handlers: unknown[] = []
    for (const mod of activeModules.value) {
      if (mod.mockHandlers) handlers.push(...mod.mockHandlers())
    }
    return handlers
  }

  return {
    allModules,
    enabledModules,
    activeModules,
    routes,
    navItems,
    modulesByCategory,
    registerModule,
    registerModules,
    enableModule,
    disableModule,
    getModule,
    initModules,
    collectMockHandlers,
  }
})

// ─── Bootstrap Helper ────────────────────────────────────

/**
 * Initialize modules and register their routes in one step.
 * Route registration with layout wrapping is a bootstrap concern — it lives
 * here rather than in the store so the store stays free of Component references.
 * Call this once after pinia is installed and before the router is installed.
 */
export async function setupModules(
  router: Router,
  definitions: ModuleDefinition[],
  layoutMap: Record<string, Component>,
): Promise<void> {
  const store = useModuleStore()
  await store.initModules(definitions)

  for (const route of store.routes) {
    const layoutName = route.meta?.layout
    const layoutComponent = layoutName ? layoutMap[layoutName] : undefined

    if (layoutName && !layoutComponent) {
      moduleLogger.warn(
        `Route "${route.path}" (module "${route.meta?.module ?? 'unknown'}") declares unknown layout "${layoutName}" — registering without layout wrapper.`,
      )
    }

    if (layoutComponent) {
      router.addRoute({
        path: route.path,
        component: layoutComponent,
        children: [{ ...route, path: '' }],
      })
    } else {
      router.addRoute(route)
    }
  }
}
