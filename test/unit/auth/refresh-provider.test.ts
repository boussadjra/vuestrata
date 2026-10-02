import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import {
  handleTokenRefresh,
  installApiAuth,
  resetAuthInterceptor,
} from '@/lib/api/auth-interceptor'
import type { ApiAuthProvider } from '@/lib/api/types'
import { AppError } from '@/lib/errors'

/**
 * The refresh half of `ApiAuthProvider`.
 *
 * A provider that implements `refresh()` owns the refresh request; the
 * interceptor keeps what it always did around it — one refresh in flight, the
 * cooldown, the retries — and no longer needs a refresh token JavaScript can
 * read. A provider without `refresh()` gets the request the interceptor used
 * to build itself, which is what keeps a project that wires its own provider
 * working across the upgrade.
 */

const baseURL = 'https://api.test'

function createProvider(overrides: Partial<ApiAuthProvider> = {}) {
  const state = { token: 'access-1' as string | null, refreshToken: null as string | null }
  const provider: ApiAuthProvider = {
    getToken: () => state.token,
    getRefreshToken: () => state.refreshToken,
    setAuth: vi.fn((token: string, refreshToken: string) => {
      state.token = token
      state.refreshToken = refreshToken || state.refreshToken
    }),
    clearAuth: vi.fn(() => {
      state.token = null
      state.refreshToken = null
    }),
    ...overrides,
  }
  installApiAuth(provider)
  return { provider, state }
}

function refused(status: number) {
  return new AppError({ message: 'refused', status, kind: 'http' })
}

beforeEach(() => {
  resetAuthInterceptor()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('a provider with refresh()', () => {
  it('refreshes through it with no refresh token in JavaScript, and never builds its own request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const refresh = vi.fn().mockResolvedValue({ token: 'access-2', expiresIn: 900 })
    const { provider } = createProvider({ refresh })

    const options: { headers?: HeadersInit } = { headers: { 'X-Other': 'keep' } }
    await expect(handleTokenRefresh(baseURL, options)).resolves.toBe(true)

    expect(refresh).toHaveBeenCalledOnce()
    expect(fetchSpy).not.toHaveBeenCalled()
    // No refresh token came back: an empty string tells the provider to keep
    // whichever it holds. The lifetime lets the store reschedule.
    expect(provider.setAuth).toHaveBeenCalledWith('access-2', '', 900)
    const headers = new Headers(options.headers)
    expect(headers.get('Authorization')).toBe('Bearer access-2')
    expect(headers.get('X-Other')).toBe('keep')
  })

  it('passes a rotated refresh token on when the backend returns one', async () => {
    const refresh = vi.fn().mockResolvedValue({ token: 'access-2', refreshToken: 'refresh-2' })
    const { provider } = createProvider({ refresh })

    await handleTokenRefresh(baseURL, {})

    expect(provider.setAuth).toHaveBeenCalledWith('access-2', 'refresh-2', undefined)
  })

  it('coalesces concurrent 401s into one refresh', async () => {
    const refresh = vi.fn().mockResolvedValue({ token: 'access-2' })
    createProvider({ refresh })

    const results = await Promise.all([
      handleTokenRefresh(baseURL, {}),
      handleTokenRefresh(baseURL, {}),
      handleTokenRefresh(baseURL, {}),
    ])

    expect(results).toEqual([true, true, true])
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does not ask when canRefresh() says there is nothing to present', async () => {
    const refresh = vi.fn()
    const { provider } = createProvider({ refresh, canRefresh: () => false })

    await expect(handleTokenRefresh(baseURL, {})).resolves.toBe(false)

    expect(refresh).not.toHaveBeenCalled()
    // Not a failed refresh: the session-expired path decides what happens.
    expect(provider.clearAuth).not.toHaveBeenCalled()
  })

  it('treats a null answer as nothing to refresh with, without retrying', async () => {
    const refresh = vi.fn().mockResolvedValue(null)
    const { provider } = createProvider({ refresh })

    await expect(handleTokenRefresh(baseURL, {})).resolves.toBe(false)

    expect(refresh).toHaveBeenCalledOnce()
    expect(provider.setAuth).not.toHaveBeenCalled()
  })

  it.each([401, 403])('stops at the first %i: the credential was refused', async (status) => {
    const refresh = vi.fn().mockRejectedValue(refused(status))
    const { provider } = createProvider({ refresh })

    await expect(handleTokenRefresh(baseURL, {})).resolves.toBe(false)

    expect(refresh).toHaveBeenCalledOnce()
    expect(provider.clearAuth).toHaveBeenCalledOnce()
  })

  it('retries a failure that can clear, then succeeds', async () => {
    vi.useFakeTimers()
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(refused(503))
      .mockResolvedValueOnce({ token: 'access-2' })
    const { provider } = createProvider({ refresh })

    const pending = handleTokenRefresh(baseURL, {})
    await vi.advanceTimersByTimeAsync(500)

    await expect(pending).resolves.toBe(true)
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(provider.clearAuth).not.toHaveBeenCalled()
  })

  it('clears the session after three failures that never cleared', async () => {
    vi.useFakeTimers()
    const refresh = vi.fn().mockRejectedValue(new Error('offline'))
    const { provider } = createProvider({ refresh })

    const pending = handleTokenRefresh(baseURL, {})
    await vi.advanceTimersByTimeAsync(1500)

    await expect(pending).resolves.toBe(false)
    expect(refresh).toHaveBeenCalledTimes(3)
    expect(provider.clearAuth).toHaveBeenCalledOnce()
  })

  it('fails the refresh when the new token cannot be stored', async () => {
    const refresh = vi.fn().mockResolvedValue({ token: 'access-2' })
    createProvider({
      refresh,
      setAuth: vi.fn(() => {
        throw new Error('QuotaExceededError')
      }),
    })

    await expect(handleTokenRefresh(baseURL, {})).resolves.toBe(false)
  })
})

describe('a provider without refresh() (the 1.0 shape)', () => {
  function respondWith(body: unknown, status = 200) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  }

  it('posts the refresh token it holds, as it always did', async () => {
    const fetchSpy = respondWith({ token: 'access-2', refreshToken: 'refresh-2', expiresIn: 60 })
    const { provider, state } = createProvider()
    state.refreshToken = 'refresh-1'

    await expect(handleTokenRefresh(baseURL, {})).resolves.toBe(true)

    const [url, init] = fetchSpy.mock.calls[0]!
    const request = new Request(url as string, init)
    expect(request.url).toBe('https://api.test/auth/refresh')
    expect(request.method).toBe('POST')
    expect(request.credentials).toBe('omit')
    await expect(request.json()).resolves.toEqual({ refreshToken: 'refresh-1' })
    // A two-argument `setAuth` written for 1.0 simply ignores the third.
    expect(provider.setAuth).toHaveBeenCalledWith('access-2', 'refresh-2', 60)
  })

  it('ignores canRefresh(), which only describes refresh()', async () => {
    const fetchSpy = respondWith({ token: 'access-2', refreshToken: 'refresh-2' })
    const { state } = createProvider({ canRefresh: () => false })
    state.refreshToken = 'refresh-1'

    await expect(handleTokenRefresh(baseURL, {})).resolves.toBe(true)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('needs a refresh token JavaScript can read', async () => {
    const fetchSpy = respondWith({ token: 'access-2' })
    createProvider()

    await expect(handleTokenRefresh(baseURL, {})).resolves.toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('stops at a 401 instead of presenting a refused token three times', async () => {
    const fetchSpy = respondWith({ message: 'Unauthorized' }, 401)
    const { provider, state } = createProvider()
    state.refreshToken = 'spent'

    await expect(handleTokenRefresh(baseURL, {})).resolves.toBe(false)

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(provider.clearAuth).toHaveBeenCalledOnce()
  })
})
