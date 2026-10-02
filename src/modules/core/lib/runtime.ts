/**
 * Cross-cutting runtime injection slots for `core/lib`.
 *
 * `core/lib` is intentionally framework-agnostic — it must not import from
 * Vue, Pinia, or VueUse directly. This file is the single allowlisted place
 * where `let` injection slots live: the app layer constructs concrete
 * backends (createGlobalState or Pinia stores) at bootstrap and installs
 * them here. `core/lib` consumers read backends through the typed accessors
 * below without learning the implementation.
 *
 * Lint policy: this file is in the `module-scope-state` allowlist
 * (see `scripts/lint/plugins/module-scope-state.plugin.mjs`).
 */

import type { ApiAuthProvider } from './api/types'
import type { ResolvedAuthConfig } from './auth/config'
import type { AuthorizationHookFn, Permission, PredicateFn, Role } from './rbac/types'

/** Backend that owns API-auth runtime state (provider, refresh, CSRF cache). */
export interface ApiAuthBackend {
  getProvider(): ApiAuthProvider | null
  setProvider(provider: ApiAuthProvider | null): void
  getRefreshPromise(): Promise<string | null> | null
  setRefreshPromise(p: Promise<string | null> | null): void
  getLastRefreshedAt(): number
  setLastRefreshedAt(ts: number): void
  /** `undefined` = not yet read; `null` = read and absent. */
  getCsrfToken(): string | null | undefined
  setCsrfToken(token: string | null | undefined): void
  /** Reset transient state (refresh promise, cooldown, csrf cache). */
  resetTransient(): void
  /** Full reset including provider — used by tests. */
  reset(): void
}

/** Backend that owns RBAC mutable registries. */
export interface RbacBackend {
  permissions: Set<string>
  predicates: Map<string, PredicateFn>
  hooks: Set<AuthorizationHookFn>
  /** Reset to seeded built-in state. */
  resetPermissions(): void
  reset(): void
}

/**
 * What the project changed about the permission model, installed once at
 * bootstrap from `app/config/rbac.overrides.ts`. Optional: with none installed
 * every role holds exactly what the built-in hierarchy gives it.
 */
export interface RbacConfig {
  grants: Partial<Record<Role, readonly Permission[]>>
  withdrawn: readonly Permission[]
}

/** Backend that owns the lazy validation-adapter cache. */
export interface ValidationCacheBackend<T = unknown> {
  get(name: string): T | undefined
  set(name: string, value: T): void
  delete(name: string): void
  clear(): void
}

let apiAuthBackend: ApiAuthBackend | null = null
let rbacBackend: RbacBackend | null = null
let validationCacheBackend: ValidationCacheBackend | null = null
let rbacConfig: RbacConfig | null = null
let authConfig: ResolvedAuthConfig | null = null

export function installApiAuthBackend(backend: ApiAuthBackend): void {
  apiAuthBackend = backend
}
export function getApiAuthBackend(): ApiAuthBackend {
  if (!apiAuthBackend) {
    throw new Error(
      'ApiAuthBackend has not been installed — call installApiAuthBackend() at bootstrap.',
    )
  }
  return apiAuthBackend
}
export function tryGetApiAuthBackend(): ApiAuthBackend | null {
  return apiAuthBackend
}

export function installRbacBackend(backend: RbacBackend): void {
  rbacBackend = backend
}
export function getRbacBackend(): RbacBackend {
  if (!rbacBackend) {
    throw new Error('RbacBackend has not been installed — call installRbacBackend() at bootstrap.')
  }
  return rbacBackend
}

export function tryGetRbacBackend(): RbacBackend | null {
  return rbacBackend
}

export function installRbacConfig(config: RbacConfig): void {
  rbacConfig = config
}
export function tryGetRbacConfig(): RbacConfig | null {
  return rbacConfig
}

/**
 * The project's `app/config/auth.config.ts`, resolved: endpoints, response
 * mappers, providers and its own adapters. Installed once at bootstrap by
 * `bootstrap/seams.ts`. Optional: with none installed the documented defaults
 * apply (`getAuthConfig()` in `core/lib/auth/config.ts` is the reader).
 */
export function installAuthConfig(config: ResolvedAuthConfig): void {
  authConfig = config
}
export function tryGetAuthConfig(): ResolvedAuthConfig | null {
  return authConfig
}

export function installValidationCacheBackend<T>(backend: ValidationCacheBackend<T>): void {
  validationCacheBackend = backend as ValidationCacheBackend
}
export function getValidationCacheBackend<T>(): ValidationCacheBackend<T> {
  if (!validationCacheBackend) {
    throw new Error(
      'ValidationCacheBackend has not been installed — call installValidationCacheBackend() at bootstrap.',
    )
  }
  return validationCacheBackend as ValidationCacheBackend<T>
}

/** @internal Test-only — reset all installed backends to null. */
export function __resetRuntimeSlots(): void {
  apiAuthBackend = null
  rbacBackend = null
  validationCacheBackend = null
  rbacConfig = null
  authConfig = null
}
