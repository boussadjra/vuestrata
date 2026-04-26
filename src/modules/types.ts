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
}

export type ModuleRoute = RouteRecordRaw

export interface ModuleNavItem {
  label: string
  icon: string
  to?: string
  permission?: Permission
  children?: ModuleNavItem[]
  /** Sort order in sidebar (lower = higher) */
  order?: number
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

  /** MSW mock handler factory (dev only) */
  mockHandlers?: () => unknown[]

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
