import { defineStore } from 'pinia'

import type { ApiAuthProvider } from '~/lib/api/types'
import type { ApiAuthBackend } from '~/lib/runtime'

/**
 * Pinia runtime store for API-auth orchestration state.
 *
 * Owns the auth provider handle, the in-flight refresh promise, the
 * post-refresh cooldown timestamp, and the CSRF token cache. Implements
 * `ApiAuthBackend` so it can be installed into `core/lib/runtime` and
 * consumed by the framework-agnostic interceptor and HTTP client.
 */
export const useApiRuntimeStore = defineStore('api-runtime', () => {
  const provider = ref<ApiAuthProvider | null>(null)
  const refreshPromise = ref<Promise<string | null> | null>(null)
  const lastRefreshedAt = ref(0)
  // `undefined` = not yet read; `null` = read and absent.
  const csrfToken = ref<string | null | undefined>(undefined)

  function getProvider(): ApiAuthProvider | null {
    return provider.value
  }
  function setProvider(p: ApiAuthProvider | null): void {
    provider.value = p
  }
  function getRefreshPromise(): Promise<string | null> | null {
    return refreshPromise.value
  }
  function setRefreshPromise(p: Promise<string | null> | null): void {
    refreshPromise.value = p
  }
  function getLastRefreshedAt(): number {
    return lastRefreshedAt.value
  }
  function setLastRefreshedAt(ts: number): void {
    lastRefreshedAt.value = ts
  }
  function getCsrfToken(): string | null | undefined {
    return csrfToken.value
  }
  function setCsrfToken(t: string | null | undefined): void {
    csrfToken.value = t
  }
  function resetTransient(): void {
    refreshPromise.value = null
    lastRefreshedAt.value = 0
    csrfToken.value = undefined
  }
  function reset(): void {
    provider.value = null
    resetTransient()
  }

  const backend: ApiAuthBackend = {
    getProvider,
    setProvider,
    getRefreshPromise,
    setRefreshPromise,
    getLastRefreshedAt,
    setLastRefreshedAt,
    getCsrfToken,
    setCsrfToken,
    resetTransient,
    reset,
  }

  return {
    provider,
    refreshPromise,
    lastRefreshedAt,
    csrfToken,
    backend,
    getProvider,
    setProvider,
    getRefreshPromise,
    setRefreshPromise,
    getLastRefreshedAt,
    setLastRefreshedAt,
    getCsrfToken,
    setCsrfToken,
    resetTransient,
    reset,
  }
})
