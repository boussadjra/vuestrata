import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

/**
 * The redirect URI of an app served under a base path.
 *
 * An identity provider sends the visitor back to the address it was given,
 * and compares that address with the one registered for the client. For an
 * app mounted at `/console/` both are `https://host/console/auth/callback`:
 * the callback ROUTE as the browser knows it. Before the base path existed the
 * adapters built `origin + /auth/callback`, which under a prefix is a path the
 * app is not served at.
 *
 * At the root the URI is unchanged; that is pinned on the wire in
 * test/integration/auth/default-wire-contract.test.ts.
 */

const ORIGIN = 'https://portal.example.test'
const CALLBACK = `${ORIGIN}/console/auth/callback`

const OAUTH_STATE_KEY = 'vuestrata-oauth-state'
const OAUTH_VERIFIER_KEY = 'vuestrata-oauth-verifier'
const OAUTH_STATE_TS_KEY = 'vuestrata-oauth-state-ts'

const tokens = {
  user: { id: 'u1', email: 'oauth@example.test', name: 'OAuth User', role: 'member' },
  token: 'access',
  refreshToken: 'refresh',
  expiresIn: 3600,
}

async function loadAdapter(name: 'oauth' | 'mock', apiFetch: ReturnType<typeof vi.fn>) {
  vi.doMock('~/lib/api/client', () => ({ apiFetch }))
  const { createAuthAdapter } = await import('@/modules/auth')
  return createAuthAdapter(name)
}

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
  vi.stubEnv('BASE_URL', '/console/')
})

afterEach(() => {
  sessionStorage.clear()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.doUnmock('~/lib/api/client')
})

describe('the oauth adapter, under a base path', () => {
  it.each([['login'], ['socialLogin']] as const)(
    '%s sends the provider a redirect_uri under the base',
    async (method) => {
      const location = { origin: ORIGIN, href: '' }
      vi.stubGlobal('location', location)
      const adapter = await loadAdapter('oauth', vi.fn())

      const started =
        method === 'login'
          ? adapter.login({ email: '', password: '' })
          : adapter.socialLogin!('github')
      await expect(started).rejects.toThrow(/redirecting/i)

      const target = new URL(location.href)
      expect(target.searchParams.get('redirect_uri')).toBe(CALLBACK)
      // The API is not under the base: the authorize endpoint stays at /api.
      expect(target.origin).toBe(ORIGIN)
      expect(target.pathname).toBe(method === 'login' ? '/api/auth/authorize' : '/api/auth/github')
    },
  )

  it('exchanges the code with the same redirect_uri it started with', async () => {
    vi.stubGlobal('location', { origin: ORIGIN, href: '' })
    sessionStorage.setItem(OAUTH_STATE_KEY, 'state-1')
    sessionStorage.setItem(OAUTH_VERIFIER_KEY, 'verifier-1')
    sessionStorage.setItem(OAUTH_STATE_TS_KEY, String(Date.now()))
    const apiFetch = vi.fn().mockResolvedValue(tokens)
    const adapter = await loadAdapter('oauth', apiFetch)

    await adapter.exchangeCode!('code-1', 'state-1')

    expect(apiFetch).toHaveBeenCalledWith(
      '/auth/token',
      expect.objectContaining({
        body: expect.objectContaining({ code: 'code-1', redirect_uri: CALLBACK }),
      }),
    )
  })
})

describe('the mock adapter, under a base path', () => {
  it('goes to its own callback route under the base, and exchanges with that address', async () => {
    const location = { origin: ORIGIN, href: '' }
    vi.stubGlobal('location', location)
    const apiFetch = vi.fn().mockResolvedValue(tokens)
    const adapter = await loadAdapter('mock', apiFetch)

    await adapter.socialLogin!('google')

    const target = new URL(location.href)
    expect(`${target.origin}${target.pathname}`).toBe(CALLBACK)
    const state = target.searchParams.get('state')!

    await adapter.exchangeCode!(target.searchParams.get('code')!, state)

    expect(apiFetch).toHaveBeenCalledWith(
      '/auth/token',
      expect.objectContaining({ body: expect.objectContaining({ redirect_uri: CALLBACK }) }),
    )
  })
})
