import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'

import { installApiAuth, resetAuthInterceptor } from '@/lib/api/client'
import type { AuthStateChange } from '@/lib/auth/adapter'
import { appEvents } from '@/lib/events'
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
 *
 * `clearAuth` takes an optional reason (1.1.0). A store from before that
 * ignores the argument and does not announce `auth.logout`, so a project that
 * edited its store also keeps the previous user's query cache until it merges
 * the new one, and a sign-out through it is not seen by the wiring below: only
 * an expiry then drops a refresh in flight.
 */
export interface AuthWiringStore {
  readonly user: User | null
  readonly token: string | null
  readonly refreshToken: string | null
  readonly isAuthenticated: boolean
  setAuth: (user: User, token: string, refreshToken?: string, expiresIn?: number) => void
  setUser: (user: User) => void
  clearAuth: (reason?: 'logout' | 'expired') => void
  setRefreshHandler: (fn: (() => void | Promise<void>) | null) => void
}

export interface AuthWiringDeps {
  /** The configured adapter name (`VUESTRATA_AUTH_ADAPTER`). */
  adapterName: string
  createAuthAdapter: typeof createAdapter
  router: Pick<Router, 'replace' | 'currentRoute'>
}

/**
 * Where an expired session sends the visitor, or null to leave them where they
 * are.
 *
 * Only a protected route needs it: on a public page the visitor loses nothing
 * but the signed-in header, and a login page they never asked for would be a
 * surprise. The destination and the reason travel as query parameters, which is
 * what lets the login page say why and return them afterwards. Already being on
 * `/auth/*` is the loop guard — that is where the redirect would land.
 */
export function expiredSessionTarget(
  route: Pick<RouteLocationNormalizedLoaded, 'fullPath' | 'path' | 'meta'> | undefined,
) {
  if (!route || route.path.startsWith('/auth/')) return null
  const meta = route.meta ?? {}
  const isProtected =
    meta.requiresAuth === true ||
    meta.requiredRole !== undefined ||
    meta.requiredPermission !== undefined ||
    (meta.requiredPermissions?.length ?? 0) > 0
  if (!isProtected) return null
  return { name: '/auth/login', query: { redirect: route.fullPath, reason: 'expired' } } as const
}

export function setupAuthInterceptor(authStore: AuthWiringStore, deps: AuthWiringDeps): void {
  const { adapterName, createAuthAdapter, router } = deps

  // One adapter for the whole session: the refresh callbacks below and the
  // proactive handler share it. The token getters are what let it present a
  // refresh token held in memory; an adapter that predates them ignores them.
  const adapter = createAuthAdapter(adapterName, {
    getToken: () => authStore.token,
    getRefreshToken: () => authStore.refreshToken,
  })

  // One refresh at a time, whoever asks. The 401 path and the proactive timer
  // can fire within the same second, and a backend that rotates the refresh
  // credential reads the second presentation of a spent one as theft and
  // revokes the session. Both callers below go through this, so the later one
  // joins the request already in flight. Feature-detected: an adapter a project
  // wrote (or edited) before `refreshSession` existed does not have it.
  const refreshSession =
    typeof adapter.refreshSession === 'function' ? adapter.refreshSession.bind(adapter) : null
  type Refreshed = Awaited<ReturnType<NonNullable<typeof refreshSession>>>
  let refreshInFlight: Promise<Refreshed> | null = null

  // Which session is in progress. A refresh takes a round trip, and the person
  // it was started for can sign out, and somebody else sign in, before it
  // answers. Every session end moves this on, and a refresh that began under
  // an earlier value is dropped: the next session neither joins it nor
  // receives its token.
  let sessionEpoch = 0
  // The access token the last refresh produced, and the session it was for.
  let minted: { token: string; epoch: number } | null = null
  // A session ended by expiry that nobody has been told about yet. It is what
  // separates an expiry (worth a redirect and a notice) from a request that
  // came back 401 after a sign-out, or for a visitor who never signed in.
  let unreportedExpiry = false

  function sessionEnded(reason?: 'logout' | 'expired') {
    sessionEpoch++
    refreshInFlight = null
    unreportedExpiry = reason === 'expired'
  }

  const hasSession = () => authStore.user !== null || authStore.token !== null

  /** End the session as expired. Answers whether there was one to end. */
  function expireSession(): boolean {
    const had = hasSession()
    authStore.clearAuth('expired')
    // The store announces this itself, and the listener below hears it. A
    // store from before 1.1.0 announces nothing, so it is recorded here too.
    if (had) sessionEnded('expired')
    // Drop any in-flight refresh and the cooldown window so a fresh login on
    // the same page does not inherit the previous session's interceptor state.
    resetAuthInterceptor()
    return had
  }

  // Every other way a session ends: `useAuth().logout()`, another tab, a
  // `/auth/me` that answered 401. The subscription lasts as long as the
  // provider installed below, which is the lifetime of the app.
  appEvents.on('auth.logout', ({ reason }) => {
    sessionEnded(reason)
    resetAuthInterceptor()
  })

  function refreshOnce(): Promise<Refreshed> {
    if (refreshInFlight) return refreshInFlight

    const startedIn = sessionEpoch
    const discard = () => {
      logger.info('A token refresh answered after its session ended — discarding it')
      return null
    }
    const flight: Promise<Refreshed> = refreshSession!()
      .then(
        (result) => {
          if (startedIn !== sessionEpoch) return discard()
          if (result?.token) minted = { token: result.token, epoch: startedIn }
          return result
        },
        (err: unknown) => {
          // A failure nobody is waiting for any more is not a failed attempt.
          if (startedIn !== sessionEpoch) return discard()
          throw err
        },
      )
      .finally(() => {
        if (refreshInFlight === flight) refreshInFlight = null
      })
    refreshInFlight = flight
    return flight
  }
  const canRefresh = (): boolean =>
    typeof adapter.canRefreshSession !== 'function' || adapter.canRefreshSession()

  installApiAuth({
    // The adapter decides whether the app sends a bearer token or relies on a
    // cookie session. The client previously did BOTH unconditionally.
    transport: adapter.transport,
    getToken: () => authStore.token,
    getRefreshToken: () => authStore.refreshToken,
    setAuth: (token, refreshToken, expiresIn) => {
      if (minted?.token === token && minted.epoch !== sessionEpoch) {
        logger.warn('Token refreshed for a session that has ended — discarding new token')
        return
      }
      const user = authStore.user
      if (!user) {
        logger.warn('Token refreshed but no user in store — discarding new token')
        return
      }
      // An empty refresh token means the backend sent none (an HttpOnly-cookie
      // session): the store then keeps whichever it already holds.
      authStore.setAuth(user, token, refreshToken || undefined, expiresIn)
    },
    clearAuth: () => {
      // Reached when every refresh attempt failed: the session is over.
      expireSession()
    },
    onSessionExpired: () => {
      // Read the location before clearing: it is what the visitor gets back to.
      const target = expiredSessionTarget(router.currentRoute?.value)
      // The refresh that was refused a moment ago has usually cleared the
      // session already, which is the expiry still to be reported.
      const expired = expireSession() || unreportedExpiry
      unreportedExpiry = false
      // A request can come back 401 just after a sign-out, or for a visitor
      // who never had a session. Neither of them was signed out by a timer,
      // and the login page must not tell them so.
      if (!expired || !target) return
      router.replace(target).catch((err) => {
        logger.error('Redirect to login failed after session expiry', { err })
      })
    },
    // Refresh through the adapter, which knows what its backend expects: a
    // cookie and no body, or a refresh token. Left off for an adapter without
    // `refreshSession`, and then the interceptor keeps the body-token refresh
    // it always had.
    ...(refreshSession ? { refresh: refreshOnce, canRefresh } : {}),
  })

  // Proactive token refresh: when the store schedules a refresh it delegates
  // to the adapter through this handler. It runs whenever the adapter CAN
  // refresh, not only when JavaScript holds a refresh token: under
  // `refresh-cookie` it never does.
  authStore.setRefreshHandler(async () => {
    // The session this timer fired for. Whatever comes back after it ended is
    // not written anywhere: the store may hold somebody else by then.
    const startedIn = sessionEpoch
    try {
      if (refreshSession) {
        if (!canRefresh()) return
        const result = await refreshOnce()
        if (startedIn !== sessionEpoch) return
        if (result?.token && authStore.user) {
          authStore.setAuth(authStore.user, result.token, result.refreshToken, result.expiresIn)
        }
        return
      }

      // An adapter from before `refreshSession`: rotate the refresh token it
      // was handed, if there is one. Cookie-session adapters have none — the
      // backend renews the session itself — so there is nothing to do.
      const rt = authStore.refreshToken
      if (!rt) return
      if (!adapter.capabilities.refresh || !adapter.refreshToken) return
      const result = await adapter.refreshToken(rt)
      if (startedIn !== sessionEpoch) return
      if (authStore.user) {
        authStore.setAuth(authStore.user, result.token, result.refreshToken, result.expiresIn)
      }
    } catch (err) {
      if (startedIn !== sessionEpoch) return
      logger.warn('Proactive token refresh failed — falling back to 401 interceptor', { err })
    }
  })

  // An adapter whose session is kept by an SDK learns of changes the app never
  // asked for: a redirect sign-in the SDK completed, a token it rotated in the
  // background, a sign-out in another tab. It reports them here, and this is
  // what puts them in the store. Feature-detected, like `refreshSession`: the
  // built-in adapters have nothing to announce. The subscription lasts as long
  // as the provider installed above, which is the lifetime of the app.
  if (typeof adapter.subscribe === 'function') {
    // Such an adapter usually also declares that the SDK stores the session.
    // The store is then never handed a refresh token, so it has none to write.
    const external = adapter.persistence === 'external'

    adapter.subscribe(({ session, reason }: AuthStateChange) => {
      if (session) {
        if (!session.user) {
          logger.warn('The auth adapter announced a session without a user — ignoring it')
          return
        }
        if (session.token) {
          const refreshToken = external ? undefined : session.refreshToken
          authStore.setAuth(session.user, session.token, refreshToken, session.expiresIn)
        } else {
          // Cookie transport: the credential is the browser's, not the app's.
          authStore.setUser(session.user)
        }
        return
      }

      // The session ended somewhere else. Whoever is on a protected page is
      // sent to sign in again, with the way back, and told why only when it
      // was not their own doing. A sign-out this tab asked for arrives here
      // too; `useAuth().logout()` then finds nothing left to clear.
      if (!hasSession()) return
      const target = expiredSessionTarget(router.currentRoute?.value)
      if (reason === 'expired') {
        expireSession()
        unreportedExpiry = false
      } else {
        authStore.clearAuth('logout')
      }
      if (!target) return
      const destination =
        reason === 'expired'
          ? target
          : ({ name: target.name, query: { redirect: target.query.redirect } } as const)
      router.replace(destination).catch((err) => {
        logger.error('Redirect to login failed after the session ended', { err })
      })
    })
  }
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
