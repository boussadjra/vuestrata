import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const OAUTH_STATE_KEY = 'vuestrata-oauth-state'
const OAUTH_VERIFIER_KEY = 'vuestrata-oauth-verifier'
const OAUTH_STATE_TS_KEY = 'vuestrata-oauth-state-ts'

function seedPkceState(overrides: { state?: string; verifier?: string | null; ts?: number } = {}) {
  sessionStorage.setItem(OAUTH_STATE_KEY, overrides.state ?? 'state-1')
  if (overrides.verifier !== null) {
    sessionStorage.setItem(OAUTH_VERIFIER_KEY, overrides.verifier ?? 'verifier-1')
  }
  sessionStorage.setItem(OAUTH_STATE_TS_KEY, String(overrides.ts ?? Date.now()))
}

/**
 * Build the OAuth adapter with a stubbed API client.
 *
 * The code exchange is now a method on the OAuth adapter rather than a free
 * function reaching into sessionStorage on its own, so these tests construct
 * that adapter explicitly instead of relying on whichever adapter the ambient
 * environment happens to configure. That also means they now test the real
 * PKCE implementation rather than the mock's deliberately-relaxed one.
 */
async function loadOAuthAdapter(apiFetch: ReturnType<typeof vi.fn>) {
  vi.doMock('~/lib/api/client', () => ({ apiFetch }))
  const { createAuthAdapter } = await import('@/modules/auth')
  return createAuthAdapter('oauth')
}

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.doUnmock('~/lib/api/client')
})

describe('OAuth adapter — authorization code exchange', () => {
  it('exchanges code + verifier for tokens and clears one-shot PKCE state', async () => {
    seedPkceState()
    const apiFetch = vi.fn().mockResolvedValue({
      user: { id: 'u1', email: 'oauth@example.test', name: 'OAuth User', role: 'member' },
      token: 'access',
      refreshToken: 'refresh',
      expiresIn: 3600,
    })
    const adapter = await loadOAuthAdapter(apiFetch)

    const result = await adapter.exchangeCode!('code-1', 'state-1')

    expect(result.token).toBe('access')
    expect(apiFetch).toHaveBeenCalledWith('/auth/token', {
      method: 'POST',
      body: {
        grant_type: 'authorization_code',
        code: 'code-1',
        code_verifier: 'verifier-1',
        redirect_uri: `${window.location.origin}/auth/callback`,
      },
    })
    expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBeNull()
    expect(sessionStorage.getItem(OAUTH_VERIFIER_KEY)).toBeNull()
    expect(sessionStorage.getItem(OAUTH_STATE_TS_KEY)).toBeNull()
  }, 15_000)

  it('rejects state mismatch and preserves PKCE state for retry', async () => {
    seedPkceState({ state: 'expected-state' })
    const apiFetch = vi.fn()
    const adapter = await loadOAuthAdapter(apiFetch)

    await expect(adapter.exchangeCode!('code-1', 'wrong-state')).rejects.toThrow(/state mismatch/i)
    expect(apiFetch).not.toHaveBeenCalled()
    // Preserved deliberately: a back-button replay should be retryable.
    expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBe('expected-state')
    expect(sessionStorage.getItem(OAUTH_VERIFIER_KEY)).toBe('verifier-1')
  })

  it('rejects expired state and clears PKCE state', async () => {
    seedPkceState({ ts: Date.now() - 11 * 60 * 1000 })
    const apiFetch = vi.fn()
    const adapter = await loadOAuthAdapter(apiFetch)

    await expect(adapter.exchangeCode!('code-1', 'state-1')).rejects.toThrow(/state expired/i)
    expect(apiFetch).not.toHaveBeenCalled()
    // Expiry is unrecoverable, so the next attempt must start clean.
    expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBeNull()
    expect(sessionStorage.getItem(OAUTH_VERIFIER_KEY)).toBeNull()
    expect(sessionStorage.getItem(OAUTH_STATE_TS_KEY)).toBeNull()
  })

  it('rejects missing verifier without clearing retryable state', async () => {
    seedPkceState({ verifier: null })
    const apiFetch = vi.fn()
    const adapter = await loadOAuthAdapter(apiFetch)

    await expect(adapter.exchangeCode!('code-1', 'state-1')).rejects.toThrow(/PKCE code verifier/i)
    expect(apiFetch).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBe('state-1')
    expect(sessionStorage.getItem(OAUTH_VERIFIER_KEY)).toBeNull()
  })

  it('preserves PKCE state when token exchange fails', async () => {
    seedPkceState()
    const apiFetch = vi.fn().mockRejectedValue(new Error('backend unavailable'))
    const adapter = await loadOAuthAdapter(apiFetch)

    await expect(adapter.exchangeCode!('code-1', 'state-1')).rejects.toThrow(/backend unavailable/i)
    // A transient backend failure must not strand the user with no way to retry.
    expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBe('state-1')
    expect(sessionStorage.getItem(OAUTH_VERIFIER_KEY)).toBe('verifier-1')
  })
})

describe('OAuth adapter — contract', () => {
  it('uses the cookie transport and advertises code exchange', async () => {
    const adapter = await loadOAuthAdapter(vi.fn())

    // Cookie transport is what turns on CSRF headers and turns off the
    // Authorization header in the API client.
    expect(adapter.transport).toBe('cookie')
    expect(adapter.capabilities.codeExchange).toBe(true)
    // Registration happens at the identity provider, and there is no client-held
    // refresh token to rotate — the backend renews the session cookie.
    expect(adapter.capabilities.register).toBe(false)
    expect(adapter.capabilities.refresh).toBe(false)
    expect(adapter.register).toBeUndefined()
    expect(adapter.refreshToken).toBeUndefined()
  })
})
