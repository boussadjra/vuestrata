import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router'

import type { Permission, Role, PaginatedResponse } from '~/types'

export type { PaginatedResponse }

// ─── Module System Types ─────────────────────────────────

export interface ModuleRouteMeta {
  requiresAuth?: boolean
  requiredRole?: Role
  requiredPermission?: Permission
  /** Multiple permissions with AND/OR semantics */
  requiredPermissions?: Permission[]
  /** 'all' (default) = AND, 'any' = OR */
  permissionMode?: 'all' | 'any'
  /** Context for resource-scoped predicates at the guard level */
  permissionContext?:
    | Record<string, unknown>
    | ((to: RouteLocationNormalized) => Record<string, unknown> | undefined)
  layout?: string
  /** Module that owns this route */
  module?: string
  /**
   * i18n key for the page name, used by the breadcrumb and the route
   * announcer. A key rather than a string: route definitions are evaluated at
   * module-registration time, long before a locale is chosen.
   */
  title?: string
  /**
   * i18n key (or literal) for this route's `<meta name="description">`.
   *
   * Optional and rarely worth setting for an authenticated console screen —
   * it matters on routes that are publicly linkable, where a link unfurler or
   * a crawler that executes JavaScript will read it.
   */
  description?: string
}

export type ModuleRoute = RouteRecordRaw

/**
 * Sidebar section headings.
 *
 * A module declares which group its entries belong to by id; the group's own
 * label and position live in one registry (`src/modules/nav-groups.ts`) rather
 * than being repeated by every contributing module. Without that, two modules
 * placing items under "Workspace" would each carry their own copy of the
 * heading and could disagree about its order.
 */
export interface ModuleNavGroupDefinition {
  /** Stable identifier referenced by `ModuleNavItem.group`. */
  id: string
  /** i18n key for the heading. Never a literal — headings are user-visible. */
  label: string
  /** Sort order among groups (lower = higher up). */
  order: number
}

export interface ModuleNavItem {
  /** i18n key, resolved with `t()` at render time. */
  label: string
  icon: string
  /**
   * Target route. Optional: a parent that only exists to hold `children`
   * renders as a disclosure button rather than a link.
   */
  to?: string
  permission?: Permission
  children?: ModuleNavItem[]
  /** Sort order within the group (lower = higher). */
  order?: number
  /** Group id from the nav-group registry. Ungrouped items fall back to `workspace`. */
  group?: string
  /**
   * Exact-match the route instead of prefix-matching.
   *
   * Prefix matching is right for a section root (`/dashboard/orders` should
   * stay active on `/dashboard/orders/42`) but wrong for an index entry that
   * sits alongside its own siblings — `/dashboard` would otherwise light up on
   * every page in the app.
   */
  exact?: boolean
}

export interface ModuleConfig {
  /** Unique module identifier (kebab-case) */
  id: string
  /** Human-readable module name */
  name: string
  /** Short description */
  description: string
  /** Module version */
  version: string
  /** Module category for grouping */
  category: ModuleCategory
  /** Order within category (lower = first) */
  order?: number
  /** Whether this module is enabled by default */
  enabledByDefault?: boolean
  /**
   * Marks the module as required platform infrastructure that cannot be
   * disabled at runtime. `disableModule()` will refuse to disable a module
   * with `required: true` and log an error. Use sparingly — only for modules
   * the app truly cannot boot without (e.g. auth, core).
   */
  required?: boolean
  /** Dependencies on other modules (by id) */
  dependencies?: string[]
  /** Permissions this module introduces */
  permissions?: string[]
}

export type ModuleCategory =
  | 'core'
  | 'system'
  | 'users'
  | 'billing'
  | 'analytics'
  | 'content'
  | (string & {})

export interface ModuleDefinition {
  /** Module configuration */
  config: ModuleConfig

  /** Routes to register */
  routes?: ModuleRoute[]

  /** Sidebar navigation items */
  navItems?: ModuleNavItem[]

  /** Per-locale translation messages keyed by locale code */
  i18n?: Record<string, Record<string, string>>

  /**
   * MSW mock handler factory — demo builds only.
   *
   * MUST return a promise from a dynamic `import()` rather than referencing
   * statically-imported handlers. A static import puts `msw` in the module
   * graph of the module barrel, which drags the whole msw-vendor chunk into
   * real production bundles even though nothing ever calls this.
   *
   * @example
   *   mockHandlers: async () => (await import('./mocks/users.handlers')).handlers
   */
  mockHandlers?: () => unknown[] | Promise<unknown[]>

  /** Called when module is installed */
  install?: () => void | Promise<void>

  /** Called when module is uninstalled */
  uninstall?: () => void
}

/**
 * Declares the public API surface that other modules may import.
 * Cross-module imports must go through the module's barrel (index.ts), never through deep paths.
 * This field is informational — enforced at the lint level via no-restricted-imports.
 */
export interface ModulePublicApi {
  /** Exported composable names (TanStack Query / reactive logic) */
  composables?: string[]
  /** Exported Pinia store names (client state) */
  stores?: string[]
  /** Exported TypeScript type names */
  types?: string[]
  /** Exported constants */
  constants?: string[]
}

export interface ModuleRegistry {
  /** All registered modules */
  modules: Map<string, ModuleDefinition>
  /** Enabled module IDs */
  enabled: Set<string>
}

export interface ModuleState {
  /** Module IDs that are enabled */
  enabledModules: string[]
}
