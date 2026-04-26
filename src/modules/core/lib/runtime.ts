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
import type { AuthorizationHookFn, PredicateFn } from './rbac/types'

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
}
