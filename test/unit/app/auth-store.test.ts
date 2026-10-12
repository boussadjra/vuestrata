import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { setupAuthInterceptor } from '@/bootstrap/auth-wiring'
import type { createAuthAdapter } from '@/modules/auth'
import { useAuthStore } from '@/stores/auth'
import { appEvents } from '~/lib/events'
import { resolveRolePermissions } from '~/lib/rbac'

import { createUser } from '../../fixtures'

/**
 * The auth store's side of a session: when it schedules a refresh, what it
 * reports as the user's permissions, and what it announces when the session
 * ends.
 *
 * The proactive refresh used to depend on a refresh token JavaScript could
 * read. Under `VUESTRATA_SESSION_PERSISTENCE=refresh-cookie` there is none by
 * design, so the timer fired and returned at once, and every session ran into
 * a 401 at the end of each access-token lifetime.
 */

type Adapter = ReturnType<typeof createAuthAdapter>

const user = createUser({ role: 'manager' })

/** An opaque token: the lifetime comes from `expiresIn` alone. */
const ACCESS = 'opaque-access-token'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  useAuthStore().reset()
  appEvents.clear('auth.logout')
  vi.useRealTimers()
})

describe('proactive refresh', () => {
  it('fires a minute before expiry with no refresh token held', async () => {
    const store = useAuthStore()
    const handler = vi.fn()
    store.setRefreshHandler(handler)

    store.setAuth(user, ACCESS, undefined, 900)
    expect(store.refreshToken).toBeNull()

    await vi.advanceTimersByTimeAsync(839_000)
    expect(handler).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('does not fire for a session that ended in the meantime', async () => {
    const store = useAuthStore()
    const handler = vi.fn()
    store.setRefreshHandler(handler)
    store.setAuth(user, ACCESS, undefined, 900)

    store.clearAuth()
    await vi.advanceTimersByTimeAsync(900_000)

    expect(handler).not.toHaveBeenCalled()
  })

  it('schedules nothing when the lifetime is unknown', async () => {
    const store = useAuthStore()
    const handler = vi.fn()
    store.setRefreshHandler(handler)

    store.setAuth(user, ACCESS)
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)

    expect(handler).not.toHaveBeenCalled()
  })

  describe('a lifetime a timer cannot hold', () => {
    const MAX_TIMER_DELAY_MS = 2 ** 31 - 1
    const THIRTY_DAYS = 30 * 24 * 60 * 60

    it('waits as long as a timer can, instead of overflowing and firing at once', async () => {
      const store = useAuthStore()
      const handler = vi.fn()
      store.setRefreshHandler(handler)
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      // `setTimeout` keeps its delay in 32 signed bits: a month in
      // milliseconds does not fit, and the browser then fires immediately —
      // into a refresh that answers with the same lifetime, and so on.
      store.setAuth(user, ACCESS, undefined, THIRTY_DAYS)

      expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), MAX_TIMER_DELAY_MS)
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(handler).not.toHaveBeenCalled()
    })

    it('still refreshes a long-lived token, early', async () => {
      const store = useAuthStore()
      const handler = vi.fn()
      store.setRefreshHandler(handler)

      store.setAuth(user, ACCESS, undefined, THIRTY_DAYS)
      await vi.advanceTimersByTimeAsync(MAX_TIMER_DELAY_MS)

      expect(handler).toHaveBeenCalledOnce()
    })

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      'schedules nothing for a lifetime of %s',
      async (lifetime) => {
        const store = useAuthStore()
        const handler = vi.fn()
        store.setRefreshHandler(handler)
        store.setAuth(user, ACCESS)

        store.scheduleTokenRefresh(lifetime)

        expect(vi.getTimerCount()).toBe(0)
        await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
        expect(handler).not.toHaveBeenCalled()
      },
    )

    it('cancels the timer it had when the new lifetime is unusable', async () => {
      const store = useAuthStore()
      const handler = vi.fn()
      store.setRefreshHandler(handler)
      store.setAuth(user, ACCESS, undefined, 900)

      store.scheduleTokenRefresh(Number.NaN)
      await vi.advanceTimersByTimeAsync(900_000)

      expect(handler).not.toHaveBeenCalled()
    })

    it('treats a lifetime already in the past as due, five seconds from now', async () => {
      const store = useAuthStore()
      const handler = vi.fn()
      store.setRefreshHandler(handler)
      store.setAuth(user, ACCESS)

      store.scheduleTokenRefresh(-3600)

      await vi.advanceTimersByTimeAsync(4_999)
      expect(handler).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(handler).toHaveBeenCalledOnce()
    })
  })

  /** The store wired as `boot()` wires it, around an adapter of the given shape. */
  function wire(adapter: Partial<Adapter>) {
    const store = useAuthStore()
    setupAuthInterceptor(store, {
      adapterName: 'jwt',
      createAuthAdapter: (() => ({
        name: 'jwt',
        transport: 'bearer',
        capabilities: { refresh: true },
        ...adapter,
      })) as unknown as typeof createAuthAdapter,
      router: { replace: vi.fn(), currentRoute: { value: undefined } } as never,
    })
    return store
  }

  it('keeps a cookie session alive: refreshes through the adapter and schedules the next one', async () => {
    let serial = 1
    const refreshSession = vi.fn(async () => ({ token: `access-${++serial}`, expiresIn: 900 }))
    const store = wire({ refreshSession, canRefreshSession: () => true })

    // What a `refresh-cookie` login leaves in the store: no refresh token.
    store.setAuth(user, 'access-1', undefined, 900)

    await vi.advanceTimersByTimeAsync(840_000)
    expect(refreshSession).toHaveBeenCalledOnce()
    expect(store.token).toBe('access-2')
    expect(store.user).toEqual(user)
    expect(store.refreshToken).toBeNull()

    // The new token carried its own lifetime, so the cycle continues.
    await vi.advanceTimersByTimeAsync(840_000)
    expect(refreshSession).toHaveBeenCalledTimes(2)
    expect(store.token).toBe('access-3')
  })

  it('keeps a memory-only bearer session working as before, rotating the token it holds', async () => {
    const refreshToken = vi.fn(async (held: string) => ({
      user,
      token: 'access-2',
      refreshToken: `${held}-rotated`,
      expiresIn: 900,
    }))
    // An adapter from before `refreshSession`: only the body-token refresh.
    const store = wire({ refreshToken })

    store.setAuth(user, 'access-1', 'refresh-1', 900)
    await vi.advanceTimersByTimeAsync(840_000)

    expect(refreshToken).toHaveBeenCalledExactlyOnceWith('refresh-1')
    expect(store.token).toBe('access-2')
    expect(store.refreshToken).toBe('refresh-1-rotated')
  })

  it('leaves the session in place when the proactive refresh fails', async () => {
    const refreshSession = vi.fn().mockRejectedValue(new Error('offline'))
    const store = wire({ refreshSession })

    store.setAuth(user, 'access-1', undefined, 900)
    await vi.advanceTimersByTimeAsync(840_000)

    // The 401 path gets its turn on the next request; a blip must not sign
    // anybody out.
    expect(refreshSession).toHaveBeenCalledOnce()
    expect(store.isAuthenticated).toBe(true)
    expect(store.token).toBe('access-1')
  })
})

describe('userPermissions', () => {
  it('derives from the role when the backend sent no permissions', () => {
    const store = useAuthStore()

    store.setAuth(createUser({ role: 'manager' }), ACCESS)

    // It used to be `[]` here, which the route guard read as "holds nothing".
    expect(store.userPermissions).toEqual(resolveRolePermissions('manager'))
  })

  it('is the explicit set when there is one, even an empty one', () => {
    const store = useAuthStore()

    store.setAuth(createUser({ role: 'admin', permissions: ['users:read'] }), ACCESS)
    expect(store.userPermissions).toEqual(['users:read'])

    store.setUser(createUser({ role: 'admin', permissions: [] }))
    expect(store.userPermissions).toEqual([])
  })

  it('is empty with nobody signed in', () => {
    expect(useAuthStore().userPermissions).toEqual([])
  })
})

describe('clearAuth', () => {
  it('announces the end of the session, with the reason when it has one', () => {
    const store = useAuthStore()
    const heard = vi.fn()
    appEvents.on('auth.logout', heard)

    for (const reason of ['expired', 'logout', undefined] as const) {
      store.setAuth(user, ACCESS, 'refresh-1', 900)
      store.clearAuth(reason)
    }

    expect(heard.mock.calls).toEqual([[{ reason: 'expired' }], [{ reason: 'logout' }], [{}]])
  })

  it('announces one session ending once, however often it is cleared', () => {
    const store = useAuthStore()
    const heard = vi.fn()
    appEvents.on('auth.logout', heard)
    store.setAuth(user, ACCESS, 'refresh-1', 900)

    // The 401 path: the refused refresh clears, then the expiry report does.
    store.clearAuth('expired')
    store.clearAuth('expired')

    expect(heard).toHaveBeenCalledExactlyOnceWith({ reason: 'expired' })
  })

  it('says nothing when nobody was signed in', () => {
    const heard = vi.fn()
    appEvents.on('auth.logout', heard)

    useAuthStore().clearAuth('expired')

    expect(heard).not.toHaveBeenCalled()
  })

  it('announces a cookie session, which never had a token', () => {
    const store = useAuthStore()
    const heard = vi.fn()
    appEvents.on('auth.logout', heard)
    store.setUser(user)

    store.clearAuth('logout')

    expect(heard).toHaveBeenCalledOnce()
  })

  it('has already dropped the session by the time subscribers hear of it', () => {
    const store = useAuthStore()
    store.setAuth(user, ACCESS, 'refresh-1', 900)
    const seen: Array<{ authenticated: boolean; token: string | null }> = []
    appEvents.on('auth.logout', () => {
      seen.push({ authenticated: store.isAuthenticated, token: store.token })
    })

    store.clearAuth('logout')

    expect(seen).toEqual([{ authenticated: false, token: null }])
  })

  it('still clears when a subscriber throws', () => {
    const store = useAuthStore()
    store.setAuth(user, ACCESS)
    appEvents.on('auth.logout', () => {
      throw new Error('subscriber bug')
    })

    expect(() => store.clearAuth('logout')).not.toThrow()
    expect(store.isAuthenticated).toBe(false)
  })
})
