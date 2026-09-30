import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { restoreSessionForBoot, setupAuthInterceptor } from '@/bootstrap/auth-wiring'
import type { AuthWiringStore } from '@/bootstrap/auth-wiring'
import type { createAuthAdapter } from '@/modules/auth'
import type { restoreSession as restoreSessionDefault } from '@/plugins/session-restore'
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

/** The first argument of the first call — and a failure, not undefined, if there was none. */
function firstArg<T>(fn: unknown): T {
  const call = (fn as ReturnType<typeof vi.fn>).mock.calls[0]
  if (!call) throw new Error('expected a call, but there was none')
  return call[0] as T
}

const user = { id: 'u1', email: 'a@example.com', role: 'admin' } as unknown as User

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

function wire(
  store: AuthWiringStore,
  adapter: Adapter,
  router = { replace: vi.fn().mockResolvedValue(undefined) },
) {
  const create = vi.fn(() => adapter) as unknown as typeof createAuthAdapter
  setupAuthInterceptor(store, { adapterName: 'jwt', createAuthAdapter: create, router })
  return { create, router, provider: getApiAuthBackend().getProvider()! }
}

describe('setupAuthInterceptor', () => {
  beforeEach(() => vi.clearAllMocks())

  it('installs the store as the API client auth provider, with the adapter transport', () => {
    const store = fakeStore()
    const { create, provider } = wire(store, fakeAdapter({ transport: 'cookie' }))

    expect(create).toHaveBeenCalledWith('jwt')
    expect(provider.transport).toBe('cookie')
    expect(provider.getToken()).toBe('access-1')
    expect(provider.getRefreshToken()).toBe('refresh-1')
  })

  it('stores a refreshed token against the current user', () => {
    const store = fakeStore({ user })
    const { provider } = wire(store, fakeAdapter())

    provider.setAuth('access-2', 'refresh-2')

    expect(store.setAuth).toHaveBeenCalledWith(user, 'access-2', 'refresh-2')
  })

  it('discards a refreshed token when nobody is signed in', () => {
    const store = fakeStore({ user: null })
    const { provider } = wire(store, fakeAdapter())

    provider.setAuth('access-2', 'refresh-2')

    expect(store.setAuth).not.toHaveBeenCalled()
  })

  it('clears the session and redirects to login when the session expires', () => {
    const store = fakeStore()
    const { provider, router } = wire(store, fakeAdapter())

    provider.onSessionExpired?.()

    expect(store.clearAuth).toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith({ name: '/auth/login' })
  })

  it('does not let a failed redirect escape as an unhandled rejection', async () => {
    const replace = vi.fn().mockRejectedValue(new Error('navigation cancelled'))
    const { provider } = wire(fakeStore(), fakeAdapter(), { replace })

    provider.onSessionExpired?.()
    await Promise.resolve()

    expect(replace).toHaveBeenCalled()
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

    it('rotates the tokens through the adapter and keeps the user', async () => {
      const store = fakeStore({ user })
      const adapter = fakeAdapter()
      const handler = await handlerFor(store, adapter)

      await handler()

      expect(adapter.refreshToken).toHaveBeenCalledWith('refresh-1')
      expect(store.setAuth).toHaveBeenCalledWith(user, 'access-2', 'refresh-2', 900)
    })

    it('does nothing without a refresh token', async () => {
      const store = fakeStore({ user, refreshToken: null })
      const adapter = fakeAdapter()
      const handler = await handlerFor(store, adapter)

      await handler()

      expect(adapter.refreshToken).not.toHaveBeenCalled()
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
