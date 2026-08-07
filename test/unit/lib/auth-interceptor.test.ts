import { describe, it, expect, beforeEach, vi } from 'vite-plus/test'

import {
  applyAuthHeaders,
  getAuthTransport,
  handleTokenRefresh,
  installApiAuth,
  notifySessionExpired,
  resetAuthInterceptor,
} from '@/lib/api/auth-interceptor'
import type { ApiAuthProvider } from '@/lib/api/types'

function createProvider(initial: Partial<ApiAuthProvider> = {}): {
  provider: ApiAuthProvider
  setAuth: ReturnType<typeof vi.fn>
  clearAuth: ReturnType<typeof vi.fn>
  onSessionExpired: ReturnType<typeof vi.fn>
  state: { token: string | null; refreshToken: string | null }
} {
  const state: { token: string | null; refreshToken: string | null } = {
    token: 'access-1',
    refreshToken: 'refresh-1',
  }
  const setAuth = vi.fn((t: string, rt: string) => {
    state.token = t
    state.refreshToken = rt
  })
  const clearAuth = vi.fn(() => {
    state.token = null
    state.refreshToken = null
  })
  const onSessionExpired = vi.fn()
  return {
    state,
    setAuth,
    clearAuth,
    onSessionExpired,
    provider: {
      getToken: () => state.token,
      getRefreshToken: () => state.refreshToken,
      setAuth,
      clearAuth,
      onSessionExpired,
      ...initial,
    },
  }
}

describe('auth-interceptor', () => {
  beforeEach(() => {
    resetAuthInterceptor()
    installApiAuth(createProvider().provider)
  })

  describe('applyAuthHeaders', () => {
    it('injects Bearer token when provider has one', () => {
      const { provider } = createProvider()
      installApiAuth(provider)
      const headers = new Headers()
      applyAuthHeaders(headers)
      expect(headers.get('Authorization')).toBe('Bearer access-1')
    })

    it('skips header when provider has no token', () => {
      const { provider } = createProvider()
      provider.getToken = () => null
      installApiAuth(provider)
      const headers = new Headers()
      applyAuthHeaders(headers)
      expect(headers.get('Authorization')).toBeNull()
    })

    // Under a cookie session the browser attaches the credential itself. An
    // Authorization header there is a second, unasked-for credential — at best
    // ignored, at worst routing the backend down a path that skips its CSRF
    // check. The client previously sent both on every request.
    it('omits the Authorization header entirely under the cookie transport', () => {
      const { provider } = createProvider()
      provider.transport = 'cookie'
      installApiAuth(provider)

      const headers = new Headers()
      applyAuthHeaders(headers)

      expect(headers.get('Authorization')).toBeNull()
    })

    it('defaults to the bearer transport when none is declared', () => {
      const { provider } = createProvider()
      installApiAuth(provider)

      expect(getAuthTransport()).toBe('bearer')
    })

    it('reports the declared transport', () => {
      const { provider } = createProvider()
      provider.transport = 'cookie'
      installApiAuth(provider)

      expect(getAuthTransport()).toBe('cookie')
    })
  })

  describe('handleTokenRefresh', () => {
    const baseURL = 'https://api.test'

    it('coalesces concurrent refreshes into a single network call', async () => {
      const { provider } = createProvider()
      installApiAuth(provider)
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ token: 'new', refreshToken: 'r2', expiresIn: 60 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )

      const [a, b, c] = await Promise.all([
        handleTokenRefresh(baseURL, { headers: {} }),
        handleTokenRefresh(baseURL, { headers: {} }),
        handleTokenRefresh(baseURL, { headers: {} }),
      ])

      expect(a).toBe(true)
      expect(b).toBe(true)
      expect(c).toBe(true)
      // Two of the three calls hit the in-flight promise; one of the three
      // may be served by the post-refresh cooldown branch — but only ONE
      // network refresh request should have been issued.
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      fetchSpy.mockRestore()
    })

    it('returns false and triggers clearAuth when all refresh attempts fail', async () => {
      const { provider, clearAuth } = createProvider()
      installApiAuth(provider)
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('boom', { status: 500 }))

      const result = await handleTokenRefresh(baseURL, { headers: {} })
      expect(result).toBe(false)
      expect(clearAuth).toHaveBeenCalledOnce()
      // 1 initial + 2 retries
      expect(fetchSpy).toHaveBeenCalledTimes(3)
      fetchSpy.mockRestore()
    })

    it('writes the refreshed token onto the retry headers', async () => {
      const { provider } = createProvider()
      installApiAuth(provider)
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ token: 'fresh', refreshToken: 'r2', expiresIn: 60 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )

      const opts: { headers: HeadersInit } = { headers: { 'X-Other': 'keep' } }
      const ok = await handleTokenRefresh(baseURL, opts)
      expect(ok).toBe(true)
      const headers = new Headers(opts.headers)
      expect(headers.get('Authorization')).toBe('Bearer fresh')
      expect(headers.get('X-Other')).toBe('keep')
      fetchSpy.mockRestore()
    })

    it('returns false when provider has no refresh token (no fetch issued)', async () => {
      const { provider } = createProvider()
      provider.getRefreshToken = () => null
      installApiAuth(provider)
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const result = await handleTokenRefresh(baseURL, { headers: {} })
      expect(result).toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })

    it('respects the cooldown window after a successful refresh', async () => {
      const { provider } = createProvider()
      installApiAuth(provider)
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ token: 'cooldown', refreshToken: 'r2', expiresIn: 60 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )

      await handleTokenRefresh(baseURL, { headers: {} })
      // Second call within cooldown should NOT issue another network refresh.
      const fetchCallsAfterFirst = fetchSpy.mock.calls.length
      await handleTokenRefresh(baseURL, { headers: {} })
      expect(fetchSpy.mock.calls.length).toBe(fetchCallsAfterFirst)
      fetchSpy.mockRestore()
    })
  })

  describe('notifySessionExpired', () => {
    it('invokes the provider callback when present', () => {
      const { provider, onSessionExpired } = createProvider()
      installApiAuth(provider)
      notifySessionExpired()
      expect(onSessionExpired).toHaveBeenCalledOnce()
    })

    it('is a no-op when no provider is installed', () => {
      // installApiAuth(null as never)  // can't uninstall — rely on reset
      resetAuthInterceptor()
      // Should not throw
      expect(() => notifySessionExpired()).not.toThrow()
    })
  })

  describe('resetAuthInterceptor', () => {
    it('clears the cooldown so the next refresh hits the network', async () => {
      const { provider } = createProvider()
      installApiAuth(provider)
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ token: 'a', refreshToken: 'b', expiresIn: 60 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      )

      await handleTokenRefresh('https://api.test', { headers: {} })
      resetAuthInterceptor()
      await handleTokenRefresh('https://api.test', { headers: {} })

      expect(fetchSpy).toHaveBeenCalledTimes(2)
      fetchSpy.mockRestore()
    })
  })
})
