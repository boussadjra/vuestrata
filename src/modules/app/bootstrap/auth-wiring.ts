import type { Router } from 'vue-router'

import { installApiAuth, resetAuthInterceptor } from '@/lib/api/client'
import { logger } from '@/lib/logger'
import type { createAuthAdapter as createAdapter } from '@/modules/auth'
import { restoreSession as restoreSessionDefault } from '@/plugins/session-restore'
import type { User } from '~/types'

import { loadDemoState, type DemoState } from './demo'

/**
 * The slice of `useAuthStore()` that boot calls.
 *
 * `stores/auth.ts` is a managed file, but a project may have edited it, and an
 * edited copy stays exactly as it was when this release lands. Every member
 * listed here has been on the store since 1.0.1-alpha.5, so an old copy
 * satisfies it. A member a later release adds to the store must be declared
 * here as OPTIONAL and called only after checking `typeof store.member ===
 * 'function'` — that check is what keeps an unmerged store from crashing boot
 * for the one minor release it takes to merge it.
 */
export interface AuthWiringStore {
  readonly user: User | null
  readonly token: string | null
  readonly refreshToken: string | null
  readonly isAuthenticated: boolean
  setAuth: (user: User, token: string, refreshToken?: string, expiresIn?: number) => void
  setUser: (user: User) => void
  clearAuth: () => void
  setRefreshHandler: (fn: (() => void | Promise<void>) | null) => void
}

export interface AuthWiringDeps {
  /** The configured adapter name (`VUESTRATA_AUTH_ADAPTER`). */
  adapterName: string
  createAuthAdapter: typeof createAdapter
  router: Pick<Router, 'replace'>
}

export function setupAuthInterceptor(authStore: AuthWiringStore, deps: AuthWiringDeps): void {
  const { adapterName, createAuthAdapter, router } = deps

  installApiAuth({
    // The adapter decides whether the app sends a bearer token or relies on a
    // cookie session. The client previously did BOTH unconditionally.
    transport: createAuthAdapter(adapterName).transport,
    getToken: () => authStore.token,
    getRefreshToken: () => authStore.refreshToken,
    setAuth: (token, refreshToken) => {
      const user = authStore.user
      if (!user) {
        logger.warn('Token refreshed but no user in store — discarding new token')
        return
      }
      authStore.setAuth(user, token, refreshToken)
    },
    clearAuth: () => {
      authStore.clearAuth()
      // Drop any in-flight refresh and the cooldown window so a fresh
      // login on the same page does not inherit the previous session's
      // interceptor state.
      resetAuthInterceptor()
    },
    onSessionExpired: () => {
      authStore.clearAuth()
      resetAuthInterceptor()
      router.replace({ name: '/auth/login' }).catch((err) => {
        logger.error('Redirect to login failed after session expiry', { err })
      })
    },
  })

  // Proactive token refresh: when the store schedules a refresh it delegates
  // to the adapter through this handler. Using the API client's refresh flow
  // keeps one code path for both reactive (on-401) and proactive refreshes.
  authStore.setRefreshHandler(async () => {
    const rt = authStore.refreshToken
    if (!rt) return
    try {
      const adapter = createAuthAdapter(adapterName)
      // Cookie-session adapters have no refresh token to rotate — the backend
      // renews the session itself — so there is nothing to do here.
      if (!adapter.capabilities.refresh || !adapter.refreshToken) return
      const result = await adapter.refreshToken(rt)
      if (authStore.user) {
        authStore.setAuth(authStore.user, result.token, result.refreshToken, result.expiresIn)
      }
    } catch (err) {
      logger.warn('Proactive token refresh failed — falling back to 401 interceptor', { err })
    }
  })
}

export interface SessionRestoreDeps extends Pick<
  AuthWiringDeps,
  'adapterName' | 'createAuthAdapter'
> {
  restoreSession?: typeof restoreSessionDefault
  /** Overridable so a test can supply a demo state without IndexedDB. */
  loadDemoState?: () => Promise<DemoState>
}

/**
 * Wire the real dependencies into `restoreSession`.
 *
 * The decision logic lives in `plugins/session-restore.ts` so it can be tested
 * without booting an app — see the note there about the `!authStore.token`
 * precondition that used to make the whole thing dead code.
 */
export async function restoreSessionForBoot(
  authStore: AuthWiringStore,
  deps: SessionRestoreDeps,
): Promise<void> {
  const { adapterName, createAuthAdapter, restoreSession = restoreSessionDefault } = deps
  const isDemoAuth = __VUESTRATA_DEMO__ && adapterName === 'mock'
  const adapter = createAuthAdapter(adapterName)

  await restoreSession({
    store: authStore,
    getUser: () => adapter.getUser(),
    resumeSession: adapter.resumeSession ? () => adapter.resumeSession!() : undefined,
    // Passing this is what selects the demo branch; the restore module needs
    // no build-mode constant of its own.
    loadDemoSession: isDemoAuth
      ? async () => {
          const { getDemoSession } = await (deps.loadDemoState ?? loadDemoState)()
          return (await getDemoSession()) ?? null
        }
      : undefined,
  })
}
