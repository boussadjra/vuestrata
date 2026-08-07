import { authAdapter as configuredAuthAdapter } from '~/config/app.config'
import { normalizeError } from '~/lib/errors'
import { createScopedLogger } from '~/lib/logger'
import { useAuthStore } from '~/stores/auth'
import type { AuthCredentials, AuthProvider } from '~/types'

import {
  createAuthAdapter,
  OAuthRedirectError,
  requireCapability,
  type AuthAdapter,
} from '../adapters'
import { useAuthChallengeStore } from '../stores/challenge'

const authLogger = createScopedLogger('auth')

// Re-exported for source compatibility. The implementations now live in
// `../adapters`; import from there in new code.
export {
  createAuthAdapter,
  isJwtExpired,
  OAuthRedirectError,
  resolveAuthAdapterName,
  UnsupportedAuthCapabilityError,
  type AuthAdapter,
  type AuthCapabilities,
  type AuthTransport,
  type SupportedAuthAdapter,
} from '../adapters'

/**
 * Singleton adapter, wrapped in `createGlobalState` so it is constructed
 * lazily (after env config and Pinia are ready), shared by every `useAuth()`
 * call, and resettable from the central test reset helper. Wrapping inline
 * avoids a circular import between the auth barrel and `app/state`.
 */
const useAuthAdapterState = createGlobalState(() => {
  const cell: { adapter: AuthAdapter | null } = { adapter: null }
  return {
    get(): AuthAdapter {
      cell.adapter ??= createAuthAdapter(configuredAuthAdapter, {
        // Threaded in so the JWT adapter can skip a request it knows will 401.
        getToken: () => useAuthStore().token,
      })
      return cell.adapter
    },
    reset(): void {
      cell.adapter = null
    },
  }
})

export function getAuthAdapter(): AuthAdapter {
  return useAuthAdapterState().get()
}

/**
 * Exchange an OAuth authorization code for tokens.
 *
 * Kept as a free function because the callback page calls it before any
 * session exists, but it now delegates to the adapter's `exchangeCode` rather
 * than reimplementing the PKCE checks — the previous free-standing version
 * meant the flow's most security-sensitive step was not part of the contract.
 */
export async function exchangeOAuthCode(code: string, state: string) {
  const adapter = getAuthAdapter()
  requireCapability(adapter, 'codeExchange', adapter.exchangeCode)
  return adapter.exchangeCode(code, state)
}

/**
 * Whitelist post-login redirects to internal paths only. An attacker-controlled
 * `?redirect=//evil.com` or `?redirect=https://evil.com` would otherwise send
 * the freshly-authenticated user off-site (open redirect). Same-origin absolute
 * URLs are accepted but normalised back to a path so vue-router treats them as
 * in-app navigations.
 */
function safeRedirectPath(raw: unknown, fallback = '/dashboard'): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback
  // Reject protocol-relative (`//host`) and any path starting with a backslash,
  // which some browsers normalise to `/`.
  if (raw.startsWith('//') || raw.startsWith('\\')) return fallback
  if (raw.startsWith('/')) return raw
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}

export function useAuth() {
  const store = useAuthStore()
  const challenge = useAuthChallengeStore()
  const router = useRouter()
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const user = computed(() => store.user)
  const isAuthenticated = computed(() => store.isAuthenticated)
  const token = computed(() => store.token)

  const remainingLockoutMs = computed(() => challenge.remainingLockoutMs)

  /**
   * What the configured adapter supports. Bind UI affordances to this rather
   * than rendering, say, a magic-link button unconditionally and letting the
   * user find out it does nothing.
   */
  const capabilities = computed(() => getAuthAdapter().capabilities)

  async function login(credentials: AuthCredentials) {
    if (challenge.isLockedOut()) {
      error.value = `Too many failed attempts. Please try again in ${Math.ceil(challenge.remainingLockoutMs / 1000)}s.`
      return
    }
    isLoading.value = true
    error.value = null
    challenge.clearMfaChallenge()
    try {
      const result = await getAuthAdapter().login(credentials)
      if (result.mfaRequired && result.mfaToken) {
        challenge.setMfaChallenge(result.mfaToken)
        authLogger.info('MFA challenge required', { email: credentials.email })
        return
      }
      store.setAuth(result.user, result.token, result.refreshToken, result.expiresIn)
      challenge.resetAttempts()
      authLogger.info('User logged in', { email: credentials.email })
      await router.push(safeRedirectPath(router.currentRoute.value.query.redirect))
    } catch (e) {
      // A redirect-in-progress is not a failure: it must not count against the
      // lockout counter or surface an error to the user.
      if (e instanceof OAuthRedirectError) return

      const { lockedOut } = challenge.recordFailedAttempt()
      if (lockedOut) {
        authLogger.warn('Account temporarily locked due to too many failed login attempts')
      }
      const appErr = normalizeError(e)
      error.value = appErr.message
      authLogger.error('Login failed', { email: credentials.email, code: appErr.code })
    } finally {
      isLoading.value = false
    }
  }

  async function register(data: AuthCredentials & { name: string }) {
    isLoading.value = true
    error.value = null
    // A fresh registration starts a brand-new session; a leftover lockout
    // counter or MFA challenge from a previous attempt would only confuse it.
    challenge.resetAttempts()
    challenge.clearMfaChallenge()
    try {
      const adapter = getAuthAdapter()
      requireCapability(adapter, 'register', adapter.register)
      const result = await adapter.register(data)
      store.setAuth(result.user, result.token, result.refreshToken, result.expiresIn)
      authLogger.info('User registered', { email: data.email })
      await router.push('/dashboard')
    } catch (e) {
      if (e instanceof OAuthRedirectError) return
      const appErr = normalizeError(e)
      error.value = appErr.message
      authLogger.error('Registration failed', { email: data.email, code: appErr.code })
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    // Backend logout failure is intentionally non-blocking: the user has
    // already decided to end their session, so client-side cleanup proceeds
    // regardless of network or backend availability. The adapter logs it.
    await getAuthAdapter().logout()
    store.clearAuth()
    // The lockout counter and any half-completed MFA challenge belong to the
    // session that just ended — clear them so the next login starts clean.
    challenge.resetAttempts()
    challenge.clearMfaChallenge()
    authLogger.info('User logged out')
    await router.push('/auth/login')
  }

  async function fetchUser() {
    if (!store.token) return
    try {
      const u = await getAuthAdapter().getUser()
      if (u) store.setUser(u)
    } catch (e) {
      const appErr = normalizeError(e)
      // Only clear auth on 401 (session truly expired). Transient errors
      // (network, 5xx) must not log the user out.
      if (appErr.status === 401) {
        store.clearAuth()
      } else {
        authLogger.warn('fetchUser failed (session kept)', {
          code: appErr.code,
          status: appErr.status,
        })
      }
    }
  }

  async function socialLogin(provider: AuthProvider) {
    isLoading.value = true
    error.value = null
    try {
      const adapter = getAuthAdapter()
      requireCapability(adapter, 'social', adapter.socialLogin)
      await adapter.socialLogin(provider)
    } catch (e) {
      if (e instanceof OAuthRedirectError) return
      error.value = normalizeError(e).message
    } finally {
      isLoading.value = false
    }
  }

  async function sendMagicLink(email: string) {
    isLoading.value = true
    error.value = null
    try {
      const adapter = getAuthAdapter()
      requireCapability(adapter, 'magicLink', adapter.sendMagicLink)
      return await adapter.sendMagicLink({ email })
    } catch (e) {
      error.value = normalizeError(e).message
      return undefined
    } finally {
      isLoading.value = false
    }
  }

  async function verifyMagicLink(token: string) {
    isLoading.value = true
    error.value = null
    try {
      const adapter = getAuthAdapter()
      requireCapability(adapter, 'magicLink', adapter.verifyMagicLink)
      const result = await adapter.verifyMagicLink(token)
      store.setAuth(result.user, result.token, result.refreshToken, result.expiresIn)
      await router.push('/dashboard')
    } catch (e) {
      error.value = normalizeError(e).message
    } finally {
      isLoading.value = false
    }
  }

  async function setupMfa() {
    isLoading.value = true
    error.value = null
    try {
      const adapter = getAuthAdapter()
      requireCapability(adapter, 'mfa', adapter.setupMfa)
      return await adapter.setupMfa()
    } catch (e) {
      error.value = normalizeError(e).message
      return undefined
    } finally {
      isLoading.value = false
    }
  }

  async function verifyMfaCode(code: string) {
    if (!challenge.mfaToken) {
      error.value = 'No MFA session active'
      return
    }
    isLoading.value = true
    error.value = null
    try {
      const adapter = getAuthAdapter()
      requireCapability(adapter, 'mfa', adapter.verifyMfa)
      const result = await adapter.verifyMfa({ mfaToken: challenge.mfaToken, code })
      challenge.clearMfaChallenge()
      store.setAuth(result.user, result.token, result.refreshToken, result.expiresIn)
      authLogger.info('MFA verified successfully')
      await router.push(safeRedirectPath(router.currentRoute.value.query.redirect))
    } catch (e) {
      const appErr = normalizeError(e)
      error.value = appErr.message
      authLogger.error('MFA verification failed', { code: appErr.code })
    } finally {
      isLoading.value = false
    }
  }

  async function disableMfa() {
    isLoading.value = true
    error.value = null
    try {
      const adapter = getAuthAdapter()
      requireCapability(adapter, 'mfa', adapter.disableMfa)
      await adapter.disableMfa()
      if (store.user) store.setUser({ ...store.user, mfaEnabled: false })
      authLogger.info('MFA disabled')
    } catch (e) {
      error.value = normalizeError(e).message
    } finally {
      isLoading.value = false
    }
  }

  return {
    user,
    isAuthenticated,
    token,
    isLoading,
    error,
    capabilities,
    mfaRequired: computed(() => challenge.mfaRequired),
    mfaToken: computed(() => challenge.mfaToken),
    loginAttempts: computed(() => challenge.loginAttempts),
    remainingLockoutMs,
    login,
    register,
    logout,
    fetchUser,
    socialLogin,
    sendMagicLink,
    verifyMagicLink,
    setupMfa,
    verifyMfaCode,
    disableMfa,
  }
}
