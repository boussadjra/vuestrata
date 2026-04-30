import { jwtDecode } from 'jwt-decode'

import { authAdapter as configuredAuthAdapter, AUTH_ADAPTER_ENV_KEY } from '~/config/app.config'
import { apiFetch } from '~/lib/api/client'
import { normalizeError } from '~/lib/errors'
import { createScopedLogger } from '~/lib/logger'
import { clearDemoSession } from '~/state/demo-store'
import { useAuthStore } from '~/stores/auth'
import type {
  AuthCredentials,
  User,
  AuthProvider,
  AuthResponse,
  MagicLinkRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
} from '~/types'

import { generateCodeVerifier, generateCodeChallenge, generateState } from '../lib/pkce'
import { useAuthChallengeStore } from '../stores/challenge'

const authLogger = createScopedLogger('auth')
const SUPPORTED_AUTH_ADAPTERS = ['mock', 'jwt', 'oauth'] as const
type SupportedAuthAdapter = (typeof SUPPORTED_AUTH_ADAPTERS)[number]

// Runtime whitelist of OAuth providers we know how to redirect to. Keep in
// sync with the `AuthProvider` type union; the TS-level union does not
// survive `?provider=` query strings or untrusted callers.
const SUPPORTED_OAUTH_PROVIDERS = new Set<AuthProvider>(['google', 'github', 'microsoft'])

function assertOAuthProvider(provider: AuthProvider): void {
  if (!SUPPORTED_OAUTH_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported OAuth provider: "${provider}"`)
  }
}

/**
 * Sentinel thrown by OAuth `login()` / `register()` to signal that the page is
 * about to be replaced by a provider redirect. Callers awaiting the promise
 * can detect it via `instanceof OAuthRedirectError` and skip error UI.
 */
export class OAuthRedirectError extends Error {
  constructor(message = 'Redirecting to OAuth provider') {
    super(message)
    this.name = 'OAuthRedirectError'
  }
}

export type AuthAdapter = {
  login(credentials: AuthCredentials): Promise<AuthResponse>
  register(credentials: AuthCredentials & { name: string }): Promise<AuthResponse>
  logout(): Promise<void>
  getUser(): Promise<User | null>
  refreshToken(token: string): Promise<AuthResponse>
  socialLogin(provider: AuthProvider): Promise<void>
  sendMagicLink(request: MagicLinkRequest): Promise<{ message: string }>
  verifyMagicLink(token: string): Promise<AuthResponse>
  setupMfa(): Promise<MfaSetupResponse>
  verifyMfa(request: MfaVerifyRequest): Promise<AuthResponse>
  disableMfa(): Promise<void>
}

/**
 * Shared adapter implementation used by both the mock and JWT adapters.
 * Both delegate every operation to the same backend endpoints — they only
 * differ in token-expiry awareness, which lives in `isJwtExpired` and is
 * consumed by callers that hold a JWT (currently the proactive refresh path).
 */
function createBaseAdapter(): AuthAdapter {
  return {
    async login(credentials) {
      return apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        body: credentials,
      })
    },
    async register(data) {
      return apiFetch<AuthResponse>('/auth/register', {
        method: 'POST',
        body: data,
      })
    },
    async logout() {
      // Backend logout failures must never block client-side cleanup, but they
      // should still be visible in logs so operators can spot a stuck endpoint.
      await apiFetch('/auth/logout', { method: 'POST' }).catch((err) => {
        authLogger.warn('Logout API call failed (clearing local session anyway)', { err })
      })
    },
    async getUser() {
      return apiFetch<User>('/auth/me')
    },
    async refreshToken(token: string) {
      return apiFetch<AuthResponse>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: token },
      })
    },
    async socialLogin(provider: AuthProvider) {
      assertOAuthProvider(provider)
      authLogger.info(`Social login with ${provider} — redirecting to provider...`)
      window.location.href = `/api/auth/${provider}`
    },
    async sendMagicLink(request: MagicLinkRequest) {
      return apiFetch<{ message: string }>('/auth/magic-link', {
        method: 'POST',
        body: request,
      })
    },
    async verifyMagicLink(token: string) {
      return apiFetch<AuthResponse>('/auth/magic-link/verify', {
        method: 'POST',
        body: { token },
      })
    },
    async setupMfa() {
      return apiFetch<MfaSetupResponse>('/auth/mfa/setup', { method: 'POST' })
    },
    async verifyMfa(request: MfaVerifyRequest) {
      return apiFetch<AuthResponse>('/auth/mfa/verify', {
        method: 'POST',
        body: request,
      })
    },
    async disableMfa() {
      await apiFetch('/auth/mfa/disable', { method: 'POST' })
    },
  }
}

/** Mock auth adapter — backed by MSW handlers in development. */
function createMockAdapter(): AuthAdapter {
  const base = createBaseAdapter()
  return {
    ...base,
    async logout() {
      await base.logout()
      await clearDemoSession()
    },
    async socialLogin(provider: AuthProvider) {
      assertOAuthProvider(provider)
      persistMockPkceState()
      const callbackUrl = new URL('/auth/callback', window.location.origin)
      callbackUrl.searchParams.set('code', `demo-oauth-code-${provider}`)
      callbackUrl.searchParams.set('state', 'mock')
      window.location.href = callbackUrl.toString()
    },
  }
}

/**
 * Inspect a JWT's `exp` claim (with a 30 s safety margin) and report whether
 * it is past expiry. Exported separately rather than smuggled onto the
 * adapter object so the type contract stays clean.
 */
export function isJwtExpired(token: string): boolean {
  try {
    const payload = jwtDecode<{ exp?: number }>(token)
    if (!payload.exp) {
      authLogger.warn('JWT missing exp claim; treating as expired')
      return true
    }
    return Date.now() >= (payload.exp - 30) * 1000
  } catch {
    return true
  }
}

/** JWT auth adapter — same wire contract as the mock; expiry is checked via `isJwtExpired`. */
function createJwtAdapter(): AuthAdapter {
  return createBaseAdapter()
}

// PKCE session keys — shared by the adapter's authorize redirects and the
// callback-side token exchange so there is a single source of truth.
const OAUTH_STATE_KEY = 'vuestrata-oauth-state'
const OAUTH_VERIFIER_KEY = 'vuestrata-oauth-verifier'
const OAUTH_STATE_TS_KEY = 'vuestrata-oauth-state-ts'

function persistPkceState(state: string, codeVerifier: string): void {
  sessionStorage.setItem(OAUTH_STATE_KEY, state)
  sessionStorage.setItem(OAUTH_VERIFIER_KEY, codeVerifier)
  // Timestamp lets the callback reject stale state entries (e.g. a verifier
  // left behind from a previous abandoned login attempt).
  sessionStorage.setItem(OAUTH_STATE_TS_KEY, String(Date.now()))
}

function persistMockPkceState(): void {
  persistPkceState('mock', 'mock-code-verifier')
}

/** OAuth adapter — full PKCE flow with redirect + callback. Reuses the
 *  base wire methods for everything except the redirect-driven login. */
function createOAuthAdapter(): AuthAdapter {
  const base = createBaseAdapter()
  return {
    ...base,
    async login() {
      // OAuth login initiates a redirect — not a direct API call.
      const state = generateState()
      const codeVerifier = generateCodeVerifier()
      const codeChallenge = await generateCodeChallenge(codeVerifier)

      // Store PKCE state in sessionStorage (survives the redirect, cleared on tab close)
      persistPkceState(state, codeVerifier)

      // Build authorization URL — the actual URL comes from your OAuth provider config.
      const authUrl = new URL('/api/auth/authorize', window.location.origin)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('state', state)
      authUrl.searchParams.set('code_challenge', codeChallenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      authUrl.searchParams.set('redirect_uri', `${window.location.origin}/auth/callback`)

      window.location.href = authUrl.toString()

      // Page is being replaced — throw a recognizable sentinel so awaiting
      // callers can distinguish "redirect in progress" from a real failure.
      throw new OAuthRedirectError()
    },

    async register() {
      // OAuth registration is handled by the provider — redirect same as login
      return this.login({ email: '', password: '' })
    },

    async socialLogin(provider: AuthProvider) {
      assertOAuthProvider(provider)
      const state = generateState()
      const codeVerifier = generateCodeVerifier()
      const codeChallenge = await generateCodeChallenge(codeVerifier)

      persistPkceState(state, codeVerifier)

      const authUrl = new URL(`/api/auth/${provider}`, window.location.origin)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('state', state)
      authUrl.searchParams.set('code_challenge', codeChallenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')
      authUrl.searchParams.set('redirect_uri', `${window.location.origin}/auth/callback`)

      window.location.href = authUrl.toString()
    },
  }
}

// PKCE state is a one-shot nonce — enforce a short lifetime so a stale
// sessionStorage entry from a previous attempt cannot be replayed.
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

/** Exchange an OAuth authorization code for tokens (called from OAuth callback page) */
export async function exchangeOAuthCode(code: string, state: string): Promise<AuthResponse> {
  const savedState = sessionStorage.getItem(OAUTH_STATE_KEY)
  const codeVerifier = sessionStorage.getItem(OAUTH_VERIFIER_KEY)
  const savedTimestamp = sessionStorage.getItem(OAUTH_STATE_TS_KEY)

  if (!savedState || savedState !== state) {
    // Don't clear sessionStorage on validation failure: leaving the entries
    // intact lets a retry of the same callback URL succeed if the user just
    // hit reload on a transient mismatch (e.g. browser back-button replay).
    // The state is one-shot only on the success path below.
    throw new Error('OAuth state mismatch — possible CSRF attack. Please try logging in again.')
  }

  const ts = savedTimestamp ? Number(savedTimestamp) : Number.NaN
  if (!Number.isFinite(ts) || Date.now() - ts > OAUTH_STATE_TTL_MS) {
    // Expired state IS unrecoverable — clear it so the next attempt starts fresh.
    sessionStorage.removeItem(OAUTH_STATE_KEY)
    sessionStorage.removeItem(OAUTH_VERIFIER_KEY)
    sessionStorage.removeItem(OAUTH_STATE_TS_KEY)
    throw new Error('OAuth state expired. Please try logging in again.')
  }

  if (!codeVerifier) {
    throw new Error('Missing PKCE code verifier. Please try logging in again.')
  }

  const response = await apiFetch<AuthResponse>('/auth/token', {
    method: 'POST',
    body: {
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: `${window.location.origin}/auth/callback`,
    },
  })

  // Only clear PKCE state on the success path so a transient backend failure
  // doesn't strand the user with no way to retry.
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(OAUTH_VERIFIER_KEY)
  sessionStorage.removeItem(OAUTH_STATE_TS_KEY)

  return response
}

const adapterMap: Record<string, () => AuthAdapter> = {
  mock: createMockAdapter,
  jwt: createJwtAdapter,
  oauth: createOAuthAdapter,
}

export function resolveAuthAdapterName(adapterName: string | undefined): SupportedAuthAdapter {
  if (!adapterName) return 'mock'
  if (SUPPORTED_AUTH_ADAPTERS.includes(adapterName as SupportedAuthAdapter)) {
    return adapterName as SupportedAuthAdapter
  }
  authLogger.warn(`Unknown ${AUTH_ADAPTER_ENV_KEY} value "${adapterName}", falling back to "mock".`)
  return 'mock'
}

export function createAuthAdapter(adapterName: string | undefined): AuthAdapter {
  const normalized = resolveAuthAdapterName(adapterName)
  return (adapterMap[normalized] ?? createMockAdapter)()
}

// Singleton adapter — wrapped in `createGlobalState` so it is constructed
// lazily (after env config and pinia are ready), shared across all
// `useAuth()` calls, and resettable in tests via the central runtime-state
// reset helper. Keeping the wrap inline avoids a circular import between the
// auth module barrel and `app/state`.
const useAuthAdapterState = createGlobalState(() => {
  const cell: { adapter: AuthAdapter | null } = { adapter: null }
  return {
    get(): AuthAdapter {
      if (!cell.adapter) {
        cell.adapter = createAuthAdapter(configuredAuthAdapter)
      }
      return cell.adapter
    },
    reset(): void {
      cell.adapter = null
    },
  }
})

function getAuthAdapter(): AuthAdapter {
  return useAuthAdapterState().get()
}

// ─── Brute-force protection (client-side) ────────────────
// Lockout + MFA challenge state lives in `useAuthChallengeStore` (see
// `src/modules/auth/stores/challenge.ts`). It used to live as module-level
// `ref`s here, which made it invisible to devtools and impossible to reset
// between tests via `setActivePinia(createPinia())`.

/**
 * Whitelist post-login redirects to internal paths only. An attacker-controlled
 * `?redirect=//evil.com` or `?redirect=https://evil.com` would otherwise send
 * the freshly-authenticated user off-site (open redirect). Same-origin absolute
 * URLs are accepted but normalised back to a path so vue-router treats them
 * as in-app navigations.
 */
function safeRedirectPath(raw: unknown, fallback = '/dashboard'): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback
  // Reject protocol-relative (`//host`) and any path starting with backslash
  // which some browsers normalise to `/`.
  if (raw.startsWith('//') || raw.startsWith('\\')) return fallback
  if (raw.startsWith('/')) return raw
  // Allow absolute same-origin URLs — extract the path/search/hash.
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
      // A redirect-in-progress is not a failure and must not count against
      // the lockout counter or surface an error to the user.
      if (e instanceof OAuthRedirectError) {
        return
      }
      const { lockedOut } = challenge.recordFailedAttempt()
      if (lockedOut) {
        authLogger.warn('Account temporarily locked due to too many failed login attempts')
      }
      const appErr = normalizeError(e)
      error.value = appErr.message
      authLogger.error('Login failed', {
        email: credentials.email,
        code: appErr.code,
      })
    } finally {
      isLoading.value = false
    }
  }

  async function register(data: AuthCredentials & { name: string }) {
    isLoading.value = true
    error.value = null
    // A fresh registration starts a brand-new session; any leftover lockout
    // counter or MFA challenge from a previous failed attempt would only
    // confuse the new account flow.
    challenge.resetAttempts()
    challenge.clearMfaChallenge()
    try {
      const result = await getAuthAdapter().register(data)
      store.setAuth(result.user, result.token, result.refreshToken, result.expiresIn)
      authLogger.info('User registered', { email: data.email })
      await router.push('/dashboard')
    } catch (e) {
      if (e instanceof OAuthRedirectError) {
        return
      }
      const appErr = normalizeError(e)
      error.value = appErr.message
      authLogger.error('Registration failed', {
        email: data.email,
        code: appErr.code,
      })
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    // Backend logout failure is intentionally non-blocking: the user has
    // already decided to end their session, so client-side cleanup must
    // proceed regardless of network or backend availability. The adapter
    // logs the underlying error.
    await getAuthAdapter().logout()
    store.clearAuth()
    // Both the lockout counter and any half-completed MFA challenge belong
    // to the session we just ended — clear them so the next login starts clean.
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
      // Only clear auth on 401 (session truly expired).
      // Transient errors (network, 500) should not log the user out.
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
      await getAuthAdapter().socialLogin(provider)
    } catch (e) {
      const appErr = normalizeError(e)
      error.value = appErr.message
    } finally {
      isLoading.value = false
    }
  }

  async function sendMagicLink(email: string) {
    isLoading.value = true
    error.value = null
    try {
      const result = await getAuthAdapter().sendMagicLink({ email })
      return result
    } catch (e) {
      const appErr = normalizeError(e)
      error.value = appErr.message
      return undefined
    } finally {
      isLoading.value = false
    }
  }

  async function verifyMagicLink(token: string) {
    isLoading.value = true
    error.value = null
    try {
      const result = await getAuthAdapter().verifyMagicLink(token)
      store.setAuth(result.user, result.token, result.refreshToken, result.expiresIn)
      await router.push('/dashboard')
    } catch (e) {
      const appErr = normalizeError(e)
      error.value = appErr.message
    } finally {
      isLoading.value = false
    }
  }

  async function setupMfa() {
    isLoading.value = true
    error.value = null
    try {
      return await getAuthAdapter().setupMfa()
    } catch (e) {
      const appErr = normalizeError(e)
      error.value = appErr.message
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
      const result = await getAuthAdapter().verifyMfa({
        mfaToken: challenge.mfaToken,
        code,
      })
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
      await getAuthAdapter().disableMfa()
      if (store.user) {
        store.setUser({ ...store.user, mfaEnabled: false })
      }
      authLogger.info('MFA disabled')
    } catch (e) {
      const appErr = normalizeError(e)
      error.value = appErr.message
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
