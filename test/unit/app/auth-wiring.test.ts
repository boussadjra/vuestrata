import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  expiredSessionTarget,
  restoreSessionForBoot,
  setupAuthInterceptor,
} from '@/bootstrap/auth-wiring'
import type { AuthWiringStore } from '@/bootstrap/auth-wiring'
import type { createAuthAdapter } from '@/modules/auth'
import type { restoreSession as restoreSessionDefault } from '@/plugins/session-restore'
import { useAuthStore } from '@/stores/auth'
import { appEvents } from '~/lib/events'
import { getApiAuthBackend } from '~/lib/runtime'
import type { User } from '~/types'

/**
 * What `boot()` hands the API client, and what it hands `restoreSession`.
 *
 * Both used to be private helpers inside `main.ts`, unreachable from a test.
 * These run against a plain-object store and a fake adapter — no Pinia, no
 * router, no network — so what is asserted is the wiring and nothing else.
 */

type Adapter = ReturnType<typeof createAuthAdapter>
type RestoreDeps = Parameters<typeof restoreSessionDefault>[0]
type WiringRouter = Parameters<typeof setupAuthInterceptor>[1]['router']
type WiringRoute = { fullPath: string; path: string; meta: Record<string, unknown> }

/** The first argument of the first call — and a failure, not undefined, if there was none. */
function firstArg<T>(fn: unknown): T {
  const call = (fn as ReturnType<typeof vi.fn>).mock.calls[0]
  if (!call) throw new Error('expected a call, but there was none')
  return call[0] as T
}

const user = { id: 'u1', email: 'a@example.com', role: 'admin' } as unknown as User

const protectedRoute: WiringRoute = {
  fullPath: '/dashboard/orders?tab=open',
  path: '/dashboard/orders',
  meta: { requiresAuth: true },
}

function fakeStore(overrides: Partial<AuthWiringStore> = {}) {
  const store = {
    user: null,
    token: 'access-1',
    refreshToken: 'refresh-1',
    isAuthenticated: false,
    setAuth: vi.fn(),
    setUser: vi.fn(),
    clearAuth: vi.fn(),
    setRefreshHandler: vi.fn(),
    ...overrides,
  }
  return store as typeof store & AuthWiringStore
}

function fakeAdapter(overrides: Partial<Adapter> = {}): Adapter {
  return {
    name: 'jwt',
    transport: 'bearer',
    capabilities: { refresh: true },
    getUser: vi.fn(async () => null),
    refreshToken: vi.fn(async () => ({
      token: 'access-2',
      refreshToken: 'refresh-2',
      expiresIn: 900,
    })),
    ...overrides,
  } as unknown as Adapter
}

function fakeRouter(route: WiringRoute = protectedRoute, replace = vi.fn().mockResolvedValue({})) {
  return { replace, currentRoute: { value: route } } as unknown as WiringRouter & {
    replace: ReturnType<typeof vi.fn>
  }
}

function wire(store: AuthWiringStore, adapter: Adapter, router = fakeRouter()) {
  const create = vi.fn(() => adapter) as unknown as typeof createAuthAdapter
  setupAuthInterceptor(store, { adapterName: 'jwt', createAuthAdapter: create, router })
  return { create, router, provider: getApiAuthBackend().getProvider()! }
}

describe('setupAuthInterceptor', () => {
  beforeEach(() => vi.clearAllMocks())
  // Each wiring subscribes to the session ending; the bus outlives the test.
  afterEach(() => {
    vi.restoreAllMocks()
    appEvents.clear('auth.logout')
  })

  it('installs the store as the API client auth provider, with the adapter transport', () => {
    const store = fakeStore()
    const { create, provider } = wire(store, fakeAdapter({ transport: 'cookie' }))

    expect(create).toHaveBeenCalledWith('jwt', expect.any(Object))
    expect(provider.transport).toBe('cookie')
    expect(provider.getToken()).toBe('access-1')
    expect(provider.getRefreshToken()).toBe('refresh-1')
  })

  it('stores a refreshed token against the current user', () => {
    const store = fakeStore({ user })
    const { provider } = wire(store, fakeAdapter())

    provider.setAuth('access-2', 'refresh-2')

    expect(store.setAuth).toHaveBeenCalledWith(user, 'access-2', 'refresh-2', undefined)
  })

  it('keeps the refresh token it holds when the backend sent none (cookie session)', () => {
    const store = fakeStore({ user })
    const { provider } = wire(store, fakeAdapter())

    provider.setAuth('access-2', '', 900)

    // Undefined, not '': the store only replaces its refresh token for a value.
    expect(store.setAuth).toHaveBeenCalledWith(user, 'access-2', undefined, 900)
  })

  it('discards a refreshed token when nobody is signed in', () => {
    const store = fakeStore({ user: null })
    const { provider } = wire(store, fakeAdapter())

    provider.setAuth('access-2', 'refresh-2')

    expect(store.setAuth).not.toHaveBeenCalled()
  })

  it('clears the session as expired when every refresh attempt failed', () => {
    const store = fakeStore()
    const { provider } = wire(store, fakeAdapter())

    provider.clearAuth()

    expect(store.clearAuth).toHaveBeenCalledWith('expired')
  })

  describe('when the session expires', () => {
    it('clears the session and sends a protected route to login with its destination and the reason', () => {
      const store = fakeStore()
      const { provider, router } = wire(store, fakeAdapter())

      provider.onSessionExpired?.()

      expect(store.clearAuth).toHaveBeenCalledWith('expired')
      expect(router.replace).toHaveBeenCalledWith({
        name: '/auth/login',
        query: { redirect: '/dashboard/orders?tab=open', reason: 'expired' },
      })
    })

    it('leaves a public page where it is', () => {
      const store = fakeStore()
      const router = fakeRouter({ fullPath: '/', path: '/', meta: {} })
      wire(store, fakeAdapter(), router).provider.onSessionExpired?.()

      expect(store.clearAuth).toHaveBeenCalledWith('expired')
      expect(router.replace).not.toHaveBeenCalled()
    })

    it('does not redirect from the auth pages, so it cannot loop', () => {
      const router = fakeRouter({
        fullPath: '/auth/login?redirect=%2Fdashboard',
        path: '/auth/login',
        meta: { requiresAuth: true },
      })
      wire(fakeStore(), fakeAdapter(), router).provider.onSessionExpired?.()

      expect(router.replace).not.toHaveBeenCalled()
    })

    /**
     * A 401 is not always an expiry. A request already on its way when the
     * visitor signs out comes back 401 too, and the login page would then tell
     * somebody who has just signed out that their session expired.
     */
    describe('when nothing expired', () => {
      const ada = { id: 'a', email: 'ada@example.com', role: 'admin' } as unknown as User

      function wireRealStore() {
        const store = useAuthStore()
        const heard = vi.fn()
        return { store, heard, ...wire(store, fakeAdapter()) }
      }

      it('does not redirect, or say so, after an explicit sign-out', () => {
        const { store, provider, router } = wireRealStore()
        store.setAuth(ada, 'A1')
        store.clearAuth('logout')

        provider.onSessionExpired?.()

        expect(router.replace).not.toHaveBeenCalled()
      })

      it('does not redirect a visitor who never had a session', () => {
        const { store, heard, provider, router } = wireRealStore()
        appEvents.on('auth.logout', heard)

        provider.onSessionExpired?.()

        expect(router.replace).not.toHaveBeenCalled()
        expect(heard).not.toHaveBeenCalled()
        expect(store.isAuthenticated).toBe(false)
      })

      it('does not redirect when a session was ended without a reason', () => {
        const { store, provider, router } = wireRealStore()
        store.setAuth(ada, 'A1')
        store.clearAuth()

        provider.onSessionExpired?.()

        expect(router.replace).not.toHaveBeenCalled()
      })

      it('still redirects when the refused refresh cleared the session first', () => {
        const { store, provider, router } = wireRealStore()
        store.setAuth(ada, 'A1')

        // The order the 401 path runs them in.
        provider.clearAuth()
        provider.onSessionExpired?.()

        expect(router.replace).toHaveBeenCalledExactlyOnceWith({
          name: '/auth/login',
          query: { redirect: '/dashboard/orders?tab=open', reason: 'expired' },
        })
      })

      it('reports one expiry once, however many requests failed with it', () => {
        const { store, provider, router } = wireRealStore()
        store.setAuth(ada, 'A1')

        provider.clearAuth()
        provider.onSessionExpired?.()
        provider.onSessionExpired?.()
        provider.onSessionExpired?.()

        expect(router.replace).toHaveBeenCalledOnce()
      })

      it('still redirects when something else noticed the expiry first', () => {
        const { store, provider, router } = wireRealStore()
        store.setAuth(ada, 'A1')
        // `useAuth().fetchUser()` on a 401 from `/auth/me`, for one.
        store.clearAuth('expired')

        provider.onSessionExpired?.()

        expect(router.replace).toHaveBeenCalledOnce()
      })

      it('does not carry an unreported expiry into the next session', () => {
        const { store, provider, router } = wireRealStore()
        store.setAuth(ada, 'A1')
        store.clearAuth('expired')
        store.setAuth(ada, 'A2')
        store.clearAuth('logout')

        provider.onSessionExpired?.()

        expect(router.replace).not.toHaveBeenCalled()
      })

      it('works with a store that announces nothing (one edited before 1.1.0)', () => {
        const session = { user: ada as User | null, token: 'A1' as string | null }
        const store = {
          get user() {
            return session.user
          },
          get token() {
            return session.token
          },
          refreshToken: null,
          isAuthenticated: true,
          setAuth: vi.fn(),
          setUser: vi.fn(),
          clearAuth: vi.fn(() => {
            session.user = null
            session.token = null
          }),
          setRefreshHandler: vi.fn(),
        } satisfies AuthWiringStore
        const { provider, router } = wire(store, fakeAdapter())

        provider.clearAuth()
        provider.onSessionExpired?.()
        provider.onSessionExpired?.()

        expect(router.replace).toHaveBeenCalledOnce()
      })
    })

    it('treats a route that declares only a permission as protected', () => {
      expect(
        expiredSessionTarget({
          fullPath: '/dashboard/billing',
          path: '/dashboard/billing',
          meta: { requiredPermission: 'billing:read' },
        } as never),
      ).toEqual({
        name: '/auth/login',
        query: { redirect: '/dashboard/billing', reason: 'expired' },
      })
    })
  })

  it('does not let a failed redirect escape as an unhandled rejection', async () => {
    const replace = vi.fn().mockRejectedValue(new Error('navigation cancelled'))
    const { provider } = wire(fakeStore(), fakeAdapter(), fakeRouter(protectedRoute, replace))

    provider.onSessionExpired?.()
    await Promise.resolve()

    expect(replace).toHaveBeenCalled()
  })

  describe('the provider the interceptor sees', () => {
    it('delegates refresh and canRefresh to an adapter that has them', async () => {
      const adapter = fakeAdapter({
        refreshSession: vi.fn(async () => ({ token: 'access-2', expiresIn: 60 })),
        canRefreshSession: vi.fn(() => true),
      } as Partial<Adapter>)
      const { provider } = wire(fakeStore(), adapter)

      expect(provider.canRefresh?.()).toBe(true)
      await expect(provider.refresh?.()).resolves.toEqual({ token: 'access-2', expiresIn: 60 })
    })

    it('answers canRefresh for an adapter that only has refreshSession', () => {
      const adapter = fakeAdapter({
        refreshSession: vi.fn(async () => ({ token: 'access-2' })),
      } as Partial<Adapter>)
      const { provider } = wire(fakeStore(), adapter)

      expect(provider.canRefresh?.()).toBe(true)
    })

    it('joins the 401 refresh and the proactive one into a single request', async () => {
      let answer: (value: { token: string; expiresIn: number }) => void = () => {}
      const refreshSession = vi.fn(
        () =>
          new Promise<{ token: string; expiresIn: number }>((resolve) => {
            answer = resolve
          }),
      )
      const store = fakeStore({ user })
      const { provider } = wire(store, fakeAdapter({ refreshSession } as Partial<Adapter>))
      const proactive = firstArg<() => Promise<void>>(store.setRefreshHandler)

      // A backend that rotates the refresh credential reads a second
      // presentation of the spent one as theft.
      const reactive = provider.refresh!()
      const scheduled = proactive()
      answer({ token: 'access-2', expiresIn: 900 })

      await expect(reactive).resolves.toEqual({ token: 'access-2', expiresIn: 900 })
      await scheduled
      expect(refreshSession).toHaveBeenCalledOnce()

      // Once it has settled, the next refresh is a new request.
      void provider.refresh!()
      expect(refreshSession).toHaveBeenCalledTimes(2)
    })

    /**
     * A refresh takes a round trip, and the person it was started for can sign
     * out, and somebody else sign in, before it answers. These run against the
     * real store, because the session ending is something the store announces.
     */
    describe('a refresh that outlives its session', () => {
      const ada = { id: 'a', email: 'ada@example.com', role: 'admin' } as unknown as User
      const grace = { id: 'b', email: 'grace@example.com', role: 'manager' } as unknown as User

      type Refreshed = { token: string; refreshToken?: string; expiresIn?: number }

      /** An adapter whose refreshes stay pending until the test answers them. */
      function heldRefreshes() {
        const pending: Array<{
          resolve: (value: Refreshed) => void
          reject: (reason: unknown) => void
        }> = []
        const refreshSession = vi.fn(
          () => new Promise<Refreshed>((resolve, reject) => pending.push({ resolve, reject })),
        )
        return { pending, refreshSession }
      }

      function wireRealStore(adapter: Partial<Adapter>) {
        const store = useAuthStore()
        const setRefreshHandler = vi.spyOn(store, 'setRefreshHandler')
        const wired = wire(store, fakeAdapter(adapter))
        return { store, ...wired, proactive: firstArg<() => Promise<void>>(setRefreshHandler) }
      }

      it('is not joined by the next session, and its token is never written', async () => {
        const { pending, refreshSession } = heldRefreshes()
        const { store, provider } = wireRealStore({ refreshSession } as Partial<Adapter>)
        store.setAuth(ada, 'A1')

        const forAda = provider.refresh!()
        store.clearAuth('logout')
        store.setAuth(grace, 'B1')
        const forGrace = provider.refresh!()

        // Grace's refresh is her own request, not Ada's still in flight.
        expect(refreshSession).toHaveBeenCalledTimes(2)

        pending[0]!.resolve({ token: 'A2' })
        await expect(forAda).resolves.toBeNull()
        expect(store.token).toBe('B1')

        pending[1]!.resolve({ token: 'B2' })
        const answer = await forGrace
        expect(answer).toEqual({ token: 'B2' })
        provider.setAuth(answer!.token, '')

        expect(store.user).toEqual(grace)
        expect(store.token).toBe('B2')
      })

      it('does not let the old refresh, when it settles, end the join on the new one', async () => {
        const { pending, refreshSession } = heldRefreshes()
        const { store, provider } = wireRealStore({ refreshSession } as Partial<Adapter>)
        store.setAuth(ada, 'A1')

        void provider.refresh!()
        store.clearAuth('logout')
        store.setAuth(grace, 'B1')
        const first = provider.refresh!()
        pending[0]!.resolve({ token: 'A2' })
        await Promise.resolve()
        await Promise.resolve()

        // A second request of Grace's still joins her refresh in flight.
        expect(provider.refresh!()).toBe(first)
        expect(refreshSession).toHaveBeenCalledTimes(2)
      })

      it('resolves to nothing when it fails after the session ended', async () => {
        const { pending, refreshSession } = heldRefreshes()
        const { store, provider } = wireRealStore({ refreshSession } as Partial<Adapter>)
        store.setAuth(ada, 'A1')

        const forAda = provider.refresh!()
        store.clearAuth('logout')
        pending[0]!.reject(new Error('offline'))

        // Nobody is waiting for it: not a failed attempt worth retrying.
        await expect(forAda).resolves.toBeNull()
      })

      it('still rejects when it fails within its own session', async () => {
        const { pending, refreshSession } = heldRefreshes()
        const { store, provider } = wireRealStore({ refreshSession } as Partial<Adapter>)
        store.setAuth(ada, 'A1')

        const forAda = provider.refresh!()
        pending[0]!.reject(new Error('offline'))

        await expect(forAda).rejects.toThrow('offline')
      })

      it('applies a refresh that completes within the same session', async () => {
        const { pending, refreshSession } = heldRefreshes()
        const { store, provider } = wireRealStore({ refreshSession } as Partial<Adapter>)
        store.setAuth(ada, 'A1')

        const forAda = provider.refresh!()
        pending[0]!.resolve({ token: 'A2', expiresIn: 900 })
        const answer = await forAda
        provider.setAuth(answer!.token, '', answer!.expiresIn)

        expect(store.user).toEqual(ada)
        expect(store.token).toBe('A2')
        store.clearRefreshTimer()
      })

      it('does not store a token whose session ended before it could be written', async () => {
        const { pending, refreshSession } = heldRefreshes()
        const { store, provider } = wireRealStore({ refreshSession } as Partial<Adapter>)
        store.setAuth(ada, 'A1')

        const forAda = provider.refresh!()
        pending[0]!.resolve({ token: 'A2' })
        const answer = await forAda
        // The refresh answered in time, and the session ended before the
        // interceptor got to store what it was handed.
        store.clearAuth('logout')
        store.setAuth(grace, 'B1')
        provider.setAuth(answer!.token, '')

        expect(store.user).toEqual(grace)
        expect(store.token).toBe('B1')
      })

      it('discards a proactive refresh that answers after the session ended', async () => {
        const { pending, refreshSession } = heldRefreshes()
        const { store, proactive } = wireRealStore({ refreshSession } as Partial<Adapter>)
        store.setAuth(ada, 'A1')

        const scheduled = proactive()
        store.clearAuth('logout')
        store.setAuth(grace, 'B1')
        pending[0]!.resolve({ token: 'A2', refreshToken: 'A-refresh-2' })
        await scheduled

        expect(store.user).toEqual(grace)
        expect(store.token).toBe('B1')
        expect(store.refreshToken).toBeNull()
      })

      it('applies a proactive refresh that answers within the same session', async () => {
        const { pending, refreshSession } = heldRefreshes()
        const { store, proactive } = wireRealStore({ refreshSession } as Partial<Adapter>)
        store.setAuth(ada, 'A1')

        const scheduled = proactive()
        pending[0]!.resolve({ token: 'A2' })
        await scheduled

        expect(store.user).toEqual(ada)
        expect(store.token).toBe('A2')
      })

      it('discards a late answer from an adapter with only the body-token refresh', async () => {
        let answer: (value: { token: string; refreshToken: string }) => void = () => {}
        const refreshToken = vi.fn(
          () =>
            new Promise<{ token: string; refreshToken: string }>((resolve) => {
              answer = resolve
            }),
        )
        const { store, proactive } = wireRealStore({
          refreshToken,
        } as unknown as Partial<Adapter>)
        store.setAuth(ada, 'A1', 'A-refresh-1')

        const scheduled = proactive()
        store.clearAuth('logout')
        store.setAuth(grace, 'B1', 'B-refresh-1')
        answer({ token: 'A2', refreshToken: 'A-refresh-2' })
        await scheduled

        expect(store.token).toBe('B1')
        expect(store.refreshToken).toBe('B-refresh-1')
      })

      it('forgets the interceptor state of a session that signed out', () => {
        const { store } = wireRealStore({})
        store.setAuth(ada, 'A1')
        const backend = getApiAuthBackend()
        backend.setRefreshPromise(Promise.resolve('A2'))
        backend.setLastRefreshedAt(Date.now())

        store.clearAuth('logout')

        // Otherwise the next session's first 401 joins this refresh, or is
        // told inside the cooldown that its token was only just refreshed.
        expect(backend.getRefreshPromise()).toBeNull()
        expect(backend.getLastRefreshedAt()).toBe(0)
      })
    })

    it('leaves them off for an adapter written before they existed, so the interceptor keeps its own path', () => {
      const { provider } = wire(fakeStore(), fakeAdapter())

      expect(provider.refresh).toBeUndefined()
      expect(provider.canRefresh).toBeUndefined()
    })

    it('hands the adapter getters for the tokens the store holds', () => {
      const store = fakeStore({ token: 'a', refreshToken: 'r' })
      const { create } = wire(store, fakeAdapter())

      const options = (create as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as {
        getToken: () => string | null
        getRefreshToken: () => string | null
      }
      expect(options.getToken()).toBe('a')
      expect(options.getRefreshToken()).toBe('r')
    })
  })

  describe('proactive refresh handler', () => {
    async function handlerFor(store: AuthWiringStore, adapter: Adapter) {
      wire(store, adapter)
      return firstArg<() => Promise<void>>(store.setRefreshHandler)
    }

    it('registers itself with the store', async () => {
      const store = fakeStore()
      await handlerFor(store, fakeAdapter())
      expect(store.setRefreshHandler).toHaveBeenCalledOnce()
    })

    it('rotates the tokens through an adapter with only the body-token refresh, and keeps the user', async () => {
      const store = fakeStore({ user })
      const adapter = fakeAdapter()
      const handler = await handlerFor(store, adapter)

      await handler()

      expect(adapter.refreshToken).toHaveBeenCalledWith('refresh-1')
      expect(store.setAuth).toHaveBeenCalledWith(user, 'access-2', 'refresh-2', 900)
    })

    it('does nothing without a refresh token, for an adapter with only the body-token refresh', async () => {
      const store = fakeStore({ user, refreshToken: null })
      const adapter = fakeAdapter()
      const handler = await handlerFor(store, adapter)

      await handler()

      expect(adapter.refreshToken).not.toHaveBeenCalled()
    })

    it('refreshes through the adapter with no JavaScript-held refresh token (cookie session)', async () => {
      const store = fakeStore({ user, refreshToken: null })
      const adapter = fakeAdapter({
        refreshSession: vi.fn(async () => ({ token: 'access-2', expiresIn: 900 })),
        canRefreshSession: vi.fn(() => true),
      } as Partial<Adapter>)
      const handler = await handlerFor(store, adapter)

      await handler()

      expect(adapter.refreshSession).toHaveBeenCalledOnce()
      expect(adapter.refreshToken).not.toHaveBeenCalled()
      expect(store.setAuth).toHaveBeenCalledWith(user, 'access-2', undefined, 900)
    })

    it('does not refresh when the adapter says it has no credential to present', async () => {
      const store = fakeStore({ user })
      const adapter = fakeAdapter({
        refreshSession: vi.fn(async () => ({ token: 'x' })),
        canRefreshSession: vi.fn(() => false),
      } as Partial<Adapter>)
      const handler = await handlerFor(store, adapter)

      await handler()

      expect(adapter.refreshSession).not.toHaveBeenCalled()
      expect(store.setAuth).not.toHaveBeenCalled()
    })

    it('leaves the session alone when the refresh answers nothing', async () => {
      const store = fakeStore({ user })
      const adapter = fakeAdapter({
        refreshSession: vi.fn(async () => null),
      } as Partial<Adapter>)
      const handler = await handlerFor(store, adapter)

      await handler()

      expect(store.setAuth).not.toHaveBeenCalled()
    })

    it('does nothing for an adapter that cannot refresh', async () => {
      const store = fakeStore({ user })
      const adapter = fakeAdapter({ capabilities: { refresh: false } } as Partial<Adapter>)
      const handler = await handlerFor(store, adapter)

      await handler()

      expect(adapter.refreshToken).not.toHaveBeenCalled()
      expect(store.setAuth).not.toHaveBeenCalled()
    })

    it('swallows a failed refresh and leaves the 401 path to recover', async () => {
      const store = fakeStore({ user })
      const adapter = fakeAdapter({
        refreshToken: vi.fn().mockRejectedValue(new Error('offline')),
      } as Partial<Adapter>)
      const handler = await handlerFor(store, adapter)

      await expect(handler()).resolves.toBeUndefined()
      expect(store.setAuth).not.toHaveBeenCalled()
    })
  })
})

describe('restoreSessionForBoot', () => {
  it('gives restoreSession the store and the adapter it resolved', async () => {
    const restoreSession = vi.fn().mockResolvedValue(undefined)
    const store = fakeStore()
    const adapter = fakeAdapter({ resumeSession: vi.fn(async () => null) } as Partial<Adapter>)
    const create = vi.fn(() => adapter) as unknown as typeof createAuthAdapter

    await restoreSessionForBoot(store, {
      adapterName: 'jwt',
      createAuthAdapter: create,
      restoreSession,
    })

    const deps = firstArg<RestoreDeps>(restoreSession)
    expect(create).toHaveBeenCalledWith('jwt')
    expect(deps.store).toBe(store)
    await deps.resumeSession?.()
    expect(adapter.resumeSession).toHaveBeenCalled()
    await deps.getUser()
    expect(adapter.getUser).toHaveBeenCalled()
  })

  it('passes no resumeSession for an adapter that cannot resume', async () => {
    const restoreSession = vi.fn().mockResolvedValue(undefined)
    const adapter = fakeAdapter({ resumeSession: undefined } as Partial<Adapter>)

    await restoreSessionForBoot(fakeStore(), {
      adapterName: 'jwt',
      createAuthAdapter: (() => adapter) as unknown as typeof createAuthAdapter,
      restoreSession,
    })

    expect(firstArg<RestoreDeps>(restoreSession).resumeSession).toBeUndefined()
  })

  describe('the demo branch', () => {
    const session = { user, token: 'demo-token' }
    const loadDemoState = vi.fn(async () => ({ getDemoSession: async () => session }) as never)

    function run(adapterName: string) {
      const restoreSession = vi.fn().mockResolvedValue(undefined)
      return restoreSessionForBoot(fakeStore(), {
        adapterName,
        createAuthAdapter: (() =>
          fakeAdapter({
            name: adapterName,
          } as Partial<Adapter>)) as unknown as typeof createAuthAdapter,
        restoreSession,
        loadDemoState,
      }).then(() => firstArg<RestoreDeps>(restoreSession))
    }

    it('reads the IndexedDB session for the mock adapter in a demo build', async () => {
      const deps = await run('mock')

      expect(await deps.loadDemoSession?.()).toBe(session)
      expect(loadDemoState).toHaveBeenCalled()
    })

    it('is not selected for a real adapter', async () => {
      expect((await run('jwt')).loadDemoSession).toBeUndefined()
    })

    it('is not selected when this is not a demo build', async () => {
      vi.stubGlobal('__VUESTRATA_DEMO__', false)
      try {
        expect((await run('mock')).loadDemoSession).toBeUndefined()
      } finally {
        vi.unstubAllGlobals()
      }
    })
  })
})
