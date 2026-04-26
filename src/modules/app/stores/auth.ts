import { jwtDecode } from 'jwt-decode'
import { defineStore } from 'pinia'

import { resetAuthInterceptor } from '~/lib/api/client'
import { createScopedLogger } from '~/lib/logger'
import type { User, Role, Permission } from '~/types'

const authStoreLogger = createScopedLogger('auth-store')

/**
 * Resolve a usable expiry (in seconds-from-now) by reconciling the explicit
 * `expiresIn` parameter with the JWT's own `exp` claim. When both are present
 * and disagree by more than 30 s we trust the token (it is what the server
 * actually validates) and warn so backend mismatches surface in logs.
 * Returns `null` if neither source yields a valid lifetime.
 */
function resolveTokenLifetime(token: string, expiresIn: number | undefined): number | null {
  let jwtSeconds: number | null = null
  try {
    const payload = jwtDecode<{ exp?: number }>(token)
    if (typeof payload.exp === 'number') {
      jwtSeconds = Math.max(0, payload.exp - Math.floor(Date.now() / 1000))
    }
  } catch {
    // Opaque/non-JWT tokens are valid for the mock and JWT adapters alike;
    // fall through to the explicit expiresIn value.
  }

  if (jwtSeconds !== null && expiresIn !== undefined && Math.abs(jwtSeconds - expiresIn) > 30) {
    authStoreLogger.warn(
      'Token exp claim disagrees with backend-supplied expiresIn — trusting JWT exp.',
      { jwtSeconds, expiresIn },
    )
    return jwtSeconds
  }
  if (jwtSeconds !== null) return jwtSeconds
  if (typeof expiresIn === 'number' && expiresIn > 0) return expiresIn
  return null
}

export const useAuthStore = defineStore('auth', () => {
  // Tokens and user data are held in-memory only — never persisted to
  // localStorage.  Real backends set HttpOnly cookies; the mock adapter
  // keeps tokens in these refs for the lifetime of the page session.
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)

  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  // Set once by the auth layer (see composables/useAuth.ts). Called before
  // the current access token expires so protected requests always carry a
  // valid token. Kept out of the store so the framework-agnostic runtime
  // never imports adapter code.
  let refreshHandler: (() => void | Promise<void>) | null = null

  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const userRole = computed<Role>(() => user.value?.role ?? 'guest')
  const userPermissions = computed<Permission[]>(() => user.value?.permissions ?? [])

  function clearRefreshTimer() {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  function scheduleTokenRefresh(expiresIn: number, onRefresh?: () => void) {
    clearRefreshTimer()
    const handler = onRefresh ?? refreshHandler
    if (!handler) return
    // Refresh 60 seconds before expiry, minimum 5 seconds from now
    const refreshInMs = Math.max((expiresIn - 60) * 1000, 5000)
    refreshTimer = setTimeout(() => {
      // Guard: the session may have been cleared between scheduling and firing
      // (logout, forced 401 from another request, tab restore, etc.). Running
      // the handler in that state would try to refresh with stale tokens.
      if (!token.value || !refreshToken.value) {
        refreshTimer = null
        return
      }
      refreshTimer = null
      void handler()
    }, refreshInMs)
  }

  /**
   * Register the refresh callback invoked by the store's scheduler.
   * Passing `null` unregisters. Typically called once at bootstrap from the
   * auth layer so both direct login and the API 401-interceptor path get
   * proactive refresh without teaching the store about adapters.
   */
  function setRefreshHandler(fn: (() => void | Promise<void>) | null) {
    refreshHandler = fn
  }

  function setAuth(u: User, t: string, rt?: string, expiresIn?: number) {
    user.value = u
    token.value = t
    if (rt) {
      refreshToken.value = rt
    }
    const lifetime = resolveTokenLifetime(t, expiresIn)
    if (lifetime !== null) {
      scheduleTokenRefresh(lifetime)
    }
  }

  function setUser(u: User) {
    user.value = u
  }

  function clearAuth() {
    user.value = null
    token.value = null
    refreshToken.value = null
    clearRefreshTimer()
  }

  /**
   * Tear down everything this store owns: the in-memory tokens, the pending
   * refresh timer, the registered refresh handler, and the API
   * interceptor's refresh-cooldown bookkeeping. Call from `app.unmount` in
   * tests or after a logout that needs to fully recycle the runtime.
   */
  function reset() {
    clearAuth()
    refreshHandler = null
    resetAuthInterceptor()
  }

  return {
    user,
    token,
    refreshToken,
    isAuthenticated,
    userRole,
    userPermissions,
    setAuth,
    setUser,
    clearAuth,
    scheduleTokenRefresh,
    clearRefreshTimer,
    setRefreshHandler,
    reset,
  }
})
