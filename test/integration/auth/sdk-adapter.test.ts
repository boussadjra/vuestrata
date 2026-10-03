import { QueryClient } from '@tanstack/vue-query'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'

import { restoreSessionForBoot, setupAuthInterceptor } from '@/bootstrap/auth-wiring'
import { clearQueryCacheOnSessionEnd } from '@/bootstrap/query-client'
import { apiFetch } from '@/lib/api/client'
import {
  installAuthConfig,
  loadAuthAdapter,
  resolveAuthConfig,
  type AuthConfig,
  type AuthStateChange,
} from '@/lib/auth'
import { appEvents } from '@/lib/events'
import { createAuthAdapter } from '@/modules/auth'
import { useAuthStore } from '@/stores/auth'
import { runtimeEnv, type SessionPersistence } from '~/lib/config'

import { resetRuntimeState } from '../../utils/reset-runtime-state'
import {
  createFakeSdk,
  createSdkAdapterFactory,
  SDK_STORAGE_KEY,
  type FakeSdk,
  type SdkSession,
} from './fake-sdk'

/**
 * An adapter whose session belongs to an SDK.
 *
 * This is the other kind of integration `auth.config.ts` opens up: not a REST
 * backend with different names, but a client library that signs in, stores the
 * session and rotates the token by itself, and tells the app afterwards. Three
 * things have to hold for that to work without editing a file of Vuestrata's:
 *
 *   - the adapter is registered by name, and loaded only when selected;
 *   - what the SDK announces (`subscribe`) drives the auth store;
 *   - the app persists nothing (`persistence: 'external'`): the SDK's storage
 *     is the only place the session is written.
 *
 * Driven end to end against a fake SDK (`./fake-sdk.ts`), with the real API
 * client, the real auth store and the bootstrap's wiring, and msw as the API
 * the SDK's tokens are presented to.
 */

const server = setupServer()

/** Put a configuration in force, as `installSeams()` does with the project's file. */
const configure = (config: AuthConfig = {}) => installAuthConfig(resolveAuthConfig(config))

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  useAuthStore().reset()
  configure({})
  runtimeEnv.sessionPersistence = DEFAULT_PERSISTENCE
  sessionStorage.clear()
  localStorage.clear()
})
afterAll(() => server.close())

const DEFAULT_PERSISTENCE = runtimeEnv.sessionPersistence

const user = { id: 'sdk-user-1', email: 'ada@example.test', name: 'Ada Lovelace', role: 'manager' }

const protectedRoute = {
  fullPath: '/dashboard/orders?tab=open',
  path: '/dashboard/orders',
  meta: { requiresAuth: true },
}

/** The project's API: it accepts whichever access token the SDK last issued. */
function api(sdk: FakeSdk) {
  const seen: (string | null)[] = []
  server.use(
    http.get('*/api/orders', ({ request }) => {
      const authorization = request.headers.get('Authorization')
      seen.push(authorization)
      const current = sdk.currentAccessToken()
      return current && authorization === `Bearer ${current}`
        ? HttpResponse.json({ ok: true })
        : HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }),
  )
  return seen
}

/**
 * What `boot()` does: install the seam, resolve the adapter, wire auth.
 *
 * `load` is the project's `() => import('~/auth/sdk-adapter')`. It is a spy so
 * a test can see that the module is fetched exactly when it is needed.
 */
async function boot(
  sdk: FakeSdk,
  mode: SessionPersistence = 'refresh-cookie',
  adapterOptions: Parameters<typeof createSdkAdapterFactory>[1] = {},
) {
  runtimeEnv.sessionPersistence = mode
  const load = vi.fn(async () => ({ default: createSdkAdapterFactory(sdk, adapterOptions) }))
  configure({ adapters: { 'fake-sdk': { transport: 'bearer', load } } })
  await loadAuthAdapter('fake-sdk')

  const store = useAuthStore()
  const router = {
    replace: vi.fn().mockResolvedValue(undefined),
    currentRoute: { value: protectedRoute },
  }
  setupAuthInterceptor(store, {
    adapterName: 'fake-sdk',
    createAuthAdapter,
    router: router as unknown as Parameters<typeof setupAuthInterceptor>[1]['router'],
  })
  return { store, router, load }
}

/** What `useAuth().login()` does with the adapter's answer. */
async function signIn(store: ReturnType<typeof useAuthStore>) {
  const result = await createAuthAdapter('fake-sdk').login({ email: user.email, password: 'pw' })
  store.setAuth(result.user, result.token, result.refreshToken, result.expiresIn)
  return result
}

/** Every key the app or the SDK has written to Web Storage. */
const storedKeys = () => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].sort()

describe('registration', () => {
  it('fetches the adapter’s module once, when the boot resolves it, and not before', async () => {
    const sdk = createFakeSdk()
    const load = vi.fn(async () => ({ default: createSdkAdapterFactory(sdk) }))
    configure({ adapters: { 'fake-sdk': { transport: 'bearer', load } } })

    // Registered, and still not downloaded: a deployment on `jwt` never pays
    // for an SDK it does not use.
    expect(load).not.toHaveBeenCalled()
    expect(() => createAuthAdapter('fake-sdk')).toThrow(/has not been loaded yet/)

    await loadAuthAdapter('fake-sdk')

    expect(load).toHaveBeenCalledOnce()
    expect(createAuthAdapter('fake-sdk').name).toBe('fake-sdk')
  })

  it('subscribes to the SDK once, from the boot wiring', async () => {
    const sdk = createFakeSdk()

    await boot(sdk)
    // Other parts of the app build their own adapter; none of them subscribes.
    createAuthAdapter('fake-sdk')
    createAuthAdapter('fake-sdk')

    expect(sdk.listenerCount()).toBe(1)
  })
})

describe('what the SDK announces drives the store', () => {
  it('signs the user in when the SDK says so, before anyone writes to the store', async () => {
    const sdk = createFakeSdk()
    const { store } = await boot(sdk)

    // A sign-in the app did not make through the adapter: the SDK finishing a
    // redirect flow, or a session picked up from another tab.
    await sdk.auth.signInWithPassword({ email: user.email, password: 'pw' })

    expect(store.isAuthenticated).toBe(true)
    expect(store.user).toEqual(user)
    expect(store.token).toBe('sdk-access-1')
    store.clearRefreshTimer()
  })

  it('follows a token the SDK rotated in the background', async () => {
    const sdk = createFakeSdk()
    const seen = api(sdk)
    const { store } = await boot(sdk)
    await signIn(store)

    await sdk.rotateInBackground()

    expect(store.token).toBe('sdk-access-2')
    expect(store.user).toEqual(user)
    // The next request presents the token the SDK now holds.
    await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })
    expect(seen).toEqual(['Bearer sdk-access-2'])
    store.clearRefreshTimer()
  })

  it('ends the session, and keeps the way back, when the user signed out elsewhere', async () => {
    const sdk = createFakeSdk()
    const { store, router } = await boot(sdk)
    await signIn(store)

    sdk.signOutElsewhere()

    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.token).toBeNull()
    // Nobody is left on a protected page with no session, and nobody is told
    // their session expired when somebody signed out.
    expect(router.replace).toHaveBeenCalledExactlyOnceWith({
      name: '/auth/login',
      query: { redirect: '/dashboard/orders?tab=open' },
    })
  })

  it('says the session expired when the SDK says that is what happened', async () => {
    const sdk = createFakeSdk()
    const { store, router } = await boot(sdk)
    await signIn(store)

    sdk.expire()

    expect(store.isAuthenticated).toBe(false)
    expect(router.replace).toHaveBeenCalledExactlyOnceWith({
      name: '/auth/login',
      query: { redirect: '/dashboard/orders?tab=open', reason: 'expired' },
    })
  })

  it('treats this tab’s own sign-out as one, not as an expiry', async () => {
    const sdk = createFakeSdk()
    const { store, router } = await boot(sdk)
    await signIn(store)
    const announced: unknown[] = []
    const { appEvents } = await import('@/lib/events')
    const stop = appEvents.on('auth.logout', (payload) => {
      announced.push(payload)
    })

    // What `useAuth().logout()` does: the adapter, then the store.
    await createAuthAdapter('fake-sdk').logout()
    store.clearAuth('logout')
    stop()

    expect(store.isAuthenticated).toBe(false)
    // Announced once, as a sign-out: the query cache is dropped exactly once.
    expect(announced).toEqual([{ reason: 'logout' }])
    expect(router.replace).toHaveBeenCalledExactlyOnceWith({
      name: '/auth/login',
      query: { redirect: '/dashboard/orders?tab=open' },
    })
  })

  it('does nothing for a sign-out when nobody was signed in', async () => {
    const sdk = createFakeSdk()
    const { store, router } = await boot(sdk)

    sdk.signOutElsewhere()

    expect(store.isAuthenticated).toBe(false)
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('leaves a visitor on a public page where they are', async () => {
    const sdk = createFakeSdk()
    const { store, router } = await boot(sdk)
    await signIn(store)
    router.currentRoute.value = { fullPath: '/pricing', path: '/pricing', meta: {} } as never

    sdk.signOutElsewhere()

    expect(store.isAuthenticated).toBe(false)
    expect(router.replace).not.toHaveBeenCalled()
  })
})

describe('the order of what the SDK announces', () => {
  const grace = {
    id: 'sdk-user-2',
    email: 'grace@example.test',
    name: 'Grace Hopper',
    role: 'admin',
  }

  /** Every session end the app announces, with who the store held at that moment. */
  function sessionEnds(store: ReturnType<typeof useAuthStore>) {
    const ends: Array<{ reason?: string; user: unknown }> = []
    const stop = appEvents.on('auth.logout', ({ reason }) => {
      ends.push({ reason, user: store.user })
    })
    return { ends, stop }
  }

  it('numbers every change, in the order the SDK made them', async () => {
    const sdk = createFakeSdk()
    await boot(sdk)
    const changes: AuthStateChange[] = []
    const stop = createAuthAdapter('fake-sdk').subscribe!((change) => changes.push(change))

    await sdk.auth.signInWithPassword({ email: user.email, password: 'pw' })
    await sdk.rotateInBackground()
    sdk.signOutElsewhere()
    stop()

    expect(changes.map((change) => change.sequence)).toEqual([1, 2, 3])
    expect(changes.map((change) => change.session?.token ?? null)).toEqual([
      'sdk-access-1',
      'sdk-access-2',
      null,
    ])
    useAuthStore().clearRefreshTimer()
  })

  it('ends one user’s session before another’s begins, when somebody else signed in elsewhere', async () => {
    const sdk = createFakeSdk()
    const seen = api(sdk)
    const { store } = await boot(sdk)
    await signIn(store)
    const queryClient = new QueryClient()
    queryClient.setQueryData(['orders'], [{ id: 'adas-order' }])
    const stopClearing = clearQueryCacheOnSessionEnd(queryClient)
    const { ends, stop } = sessionEnds(store)

    // The SDK shares its storage between tabs: Grace signed in in another one.
    sdk.signInElsewhere(grace.email)
    stop()
    stopClearing()

    // Exactly one session end, and nobody in the store while it was announced.
    expect(ends).toEqual([{ reason: 'logout', user: null }])
    expect(store.user).toEqual(grace)
    expect(store.token).toBe('sdk-access-2')
    // Grace is not shown what was fetched for Ada.
    expect(queryClient.getQueryData(['orders'])).toBeUndefined()
    await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })
    expect(seen).toEqual(['Bearer sdk-access-2'])
    store.clearRefreshTimer()
  })

  it('still signs the user in when they sign in elsewhere after signing out here', async () => {
    const sdk = createFakeSdk()
    const { store } = await boot(sdk)
    await signIn(store)
    // `useAuth().logout()`: the adapter tells the SDK, then the store is cleared.
    await createAuthAdapter('fake-sdk').logout()
    store.clearAuth('logout')
    expect(store.isAuthenticated).toBe(false)

    // The SDK reported the sign-out itself, so what it announces next is new.
    sdk.signInElsewhere(user.email)

    expect(store.isAuthenticated).toBe(true)
    expect(store.user).toEqual(user)
    expect(store.token).toBe('sdk-access-2')
    store.clearRefreshTimer()
  })

  it('does not sign the user back in when the app ended the session and the SDK was not told', async () => {
    const sdk = createFakeSdk()
    const { store } = await boot(sdk)
    await signIn(store)

    // The store was cleared (an expiry, a `/me` that answered 401) and the
    // SDK still believes in its session: it goes on rotating the token.
    store.clearAuth('expired')
    await sdk.rotateInBackground()

    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toBeNull()
    expect(store.token).toBeNull()
  })

  it('never announces a result that a later event has superseded', async () => {
    // The adapter looks something up before it tells the app, and the lookup
    // for a rotation is still out when the user signs out.
    const sdk = createFakeSdk()
    const lookups: Array<() => void> = []
    const lookup = (_session: SdkSession) =>
      new Promise<void>((resolve) => {
        lookups.push(resolve)
      })
    const { store } = await boot(sdk, 'refresh-cookie', { lookup })
    await signIn(store)
    const changes: AuthStateChange[] = []
    createAuthAdapter('fake-sdk').subscribe!((change) => changes.push(change))

    await sdk.rotateInBackground()
    sdk.signOutElsewhere()
    for (const answer of lookups) answer()
    await Promise.resolve()
    await Promise.resolve()

    // The sign-out was announced, and the rotation it overtook never was.
    expect(changes.some((change) => change.session === null)).toBe(true)
    expect(changes.some((change) => change.session?.token === 'sdk-access-2')).toBe(false)
    expect(store.isAuthenticated).toBe(false)
    expect(store.token).toBeNull()
  })

  it('keeps the session, and the SDK’s emitter, intact when the SDK’s user stops fitting', async () => {
    const sdk = createFakeSdk()
    const { store } = await boot(sdk)
    await signIn(store)

    // Thrown into the SDK's emitter, this would break every other listener.
    expect(() => sdk.announceMalformedUser()).not.toThrow()

    expect(store.user).toEqual(user)
    expect(store.token).toBe('sdk-access-1')
    store.clearRefreshTimer()
  })
})

describe("persistence: 'external'", () => {
  // The two modes under which the app WOULD write a refresh token it was
  // handed. The adapter here hands one over on every session, as a careless
  // adapter might; the app must still never keep it.
  it.each(['local', 'session'] as const)(
    'writes no token to Web Storage under %s persistence',
    async (mode) => {
      const sdk = createFakeSdk()
      api(sdk)
      const { store } = await boot(sdk, mode)

      const result = await signIn(store)
      await sdk.rotateInBackground()
      sdk.expire()
      await signIn(store)
      await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })

      // The adapter's answer reached the app without the SDK's refresh token.
      expect(result).not.toHaveProperty('refreshToken')
      expect(store.refreshToken).toBeNull()
      // The SDK's own storage, and nothing of the app's beside it.
      expect(storedKeys()).toEqual([SDK_STORAGE_KEY])
      expect(localStorage.getItem('vuestrata-refresh-token')).toBeNull()
      expect(sessionStorage.getItem('vuestrata-refresh-token')).toBeNull()
      store.clearRefreshTimer()
    },
  )

  it('holds the access token in memory only', async () => {
    const sdk = createFakeSdk()
    const { store } = await boot(sdk, 'local')
    await signIn(store)

    // What is in storage is the SDK's record. The app wrote no copy of its own.
    expect(storedKeys()).toEqual([SDK_STORAGE_KEY])
    const written = storedKeys()
      .map((key) => localStorage.getItem(key) ?? sessionStorage.getItem(key))
      .join(' ')
    expect(written.match(/sdk-access-1/g)).toHaveLength(1)
    store.clearRefreshTimer()
  })
})

describe('the session through the API client', () => {
  it('asks the SDK for a new token on a 401, and replays the request', async () => {
    const sdk = createFakeSdk()
    const seen = api(sdk)
    const { store, router } = await boot(sdk)
    await signIn(store)

    // The API stops accepting the token before the SDK got round to rotating
    // it. The store still holds the old one.
    localStorage.setItem(
      SDK_STORAGE_KEY,
      JSON.stringify({ ...JSON.parse(localStorage.getItem(SDK_STORAGE_KEY)!), access_token: 'x' }),
    )

    await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })

    expect(seen).toEqual(['Bearer sdk-access-1', 'Bearer sdk-access-2'])
    expect(store.token).toBe('sdk-access-2')
    expect(store.refreshToken).toBeNull()
    expect(router.replace).not.toHaveBeenCalled()
    store.clearRefreshTimer()
  })

  it('ends the session when the SDK has nothing to refresh with', async () => {
    const sdk = createFakeSdk()
    api(sdk)
    const { store, router } = await boot(sdk)
    await signIn(store)
    // Gone from the SDK's storage without a word: cleared site data.
    localStorage.removeItem(SDK_STORAGE_KEY)

    await expect(apiFetch('/orders')).rejects.toMatchObject({ status: 401 })

    expect(store.isAuthenticated).toBe(false)
    expect(router.replace).toHaveBeenCalledExactlyOnceWith({
      name: '/auth/login',
      query: { redirect: '/dashboard/orders?tab=open', reason: 'expired' },
    })
  })
})

describe('a reload', () => {
  it('resumes from the session the SDK stored', async () => {
    const sdk = createFakeSdk()
    const seen = api(sdk)
    const first = await boot(sdk, 'none')
    await signIn(first.store)
    first.store.clearRefreshTimer()

    // Everything in memory is gone; the SDK's storage stays.
    await resetRuntimeState()
    const { store } = await boot(createFakeSdk(), 'none')
    await restoreSessionForBoot(store, { adapterName: 'fake-sdk', createAuthAdapter })

    expect(store.isAuthenticated).toBe(true)
    expect(store.user).toEqual(user)
    expect(store.token).toBe('sdk-access-1')
    expect(store.refreshToken).toBeNull()
    await expect(apiFetch('/orders')).resolves.toEqual({ ok: true })
    expect(seen).toEqual(['Bearer sdk-access-1'])
    store.clearRefreshTimer()
  })

  it('boots signed out when the SDK has no session', async () => {
    const { store, router } = await boot(createFakeSdk())

    await restoreSessionForBoot(store, { adapterName: 'fake-sdk', createAuthAdapter })

    expect(store.isAuthenticated).toBe(false)
    expect(router.replace).not.toHaveBeenCalled()
  })
})
