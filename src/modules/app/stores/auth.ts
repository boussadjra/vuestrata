import { jwtDecode } from 'jwt-decode'
import { defineStore } from 'pinia'

import { getAuthTransport, resetAuthInterceptor } from '~/lib/api/client'
import {
  clearPersistedRefreshToken,
  persistRefreshToken,
  usesWebStorage,
} from '~/lib/auth/session-persistence'
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
  // The ACCESS token and user are held in memory only, always. Only the
  // refresh token is ever persisted, and only when the deployment opted in
  // through `VUESTRATA_SESSION_PERSISTENCE` — see
  // core/lib/auth/session-persistence.ts for the trade-off behind each mode.
  // Cookie-transport deployments persist nothing here: the browser holds an
  // HttpOnly session cookie and the app never sees a token at all.
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)

  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  // Set once by the auth layer (see composables/useAuth.ts). Called before
  // the current access token expires so protected requests always carry a
  // valid token. Kept out of the store so the framework-agnostic runtime
  // never imports adapter code.
  let refreshHandler: (() => void | Promise<void>) | null = null

  /**
   * Under cookie transport there is NEVER a client-visible token — the whole
   * point of an HttpOnly session cookie is that JavaScript cannot read it. The
   * old `!!token && !!user` definition therefore reported every cookie-session
   * user as signed out, so the route guard bounced them to /auth/login on each
   * protected route even with a perfectly valid session.
   *
   * `getAuthTransport()` is not reactive, but it is written once during
   * bootstrap and never changes afterwards; the computed also depends on
   * `user`, so the first mutation after bootstrap re-evaluates it anyway.
   */
  const isAuthenticated = computed(
    () => !!user.value && (!!token.value || getAuthTransport() === 'cookie'),
  )
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
      // Mirror rotations into storage as they happen. A backend that rotates
      // the refresh token on every use would otherwise leave a stale value
      // behind, and the next boot would present a token the server has
      // already invalidated.
      if (usesWebStorage()) persistRefreshToken(rt)
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
    // Unconditional, and it clears BOTH storage areas: a logout must not leave
    // a usable refresh token behind, including one written before the
    // deployment's persistence mode was changed.
    clearPersistedRefreshToken()
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
