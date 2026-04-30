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

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.doUnmock('~/lib/api/client')
})

describe('exchangeOAuthCode', () => {
  it('exchanges code + verifier for tokens and clears one-shot PKCE state', async () => {
    seedPkceState()
    const apiFetch = vi.fn().mockResolvedValue({
      user: { id: 'u1', email: 'oauth@example.test', name: 'OAuth User', role: 'member' },
      token: 'access',
      refreshToken: 'refresh',
      expiresIn: 3600,
    })
    vi.doMock('~/lib/api/client', () => ({ apiFetch }))

    const { exchangeOAuthCode } = await import('@/modules/auth')
    const result = await exchangeOAuthCode('code-1', 'state-1')

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
    vi.doMock('~/lib/api/client', () => ({ apiFetch }))

    const { exchangeOAuthCode } = await import('@/modules/auth')

    await expect(exchangeOAuthCode('code-1', 'wrong-state')).rejects.toThrow(/state mismatch/i)
    expect(apiFetch).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBe('expected-state')
    expect(sessionStorage.getItem(OAUTH_VERIFIER_KEY)).toBe('verifier-1')
  })

  it('rejects expired state and clears PKCE state', async () => {
    seedPkceState({ ts: Date.now() - 11 * 60 * 1000 })
    const apiFetch = vi.fn()
    vi.doMock('~/lib/api/client', () => ({ apiFetch }))

    const { exchangeOAuthCode } = await import('@/modules/auth')

    await expect(exchangeOAuthCode('code-1', 'state-1')).rejects.toThrow(/state expired/i)
    expect(apiFetch).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBeNull()
    expect(sessionStorage.getItem(OAUTH_VERIFIER_KEY)).toBeNull()
    expect(sessionStorage.getItem(OAUTH_STATE_TS_KEY)).toBeNull()
  })

  it('rejects missing verifier without clearing retryable state', async () => {
    seedPkceState({ verifier: null })
    const apiFetch = vi.fn()
    vi.doMock('~/lib/api/client', () => ({ apiFetch }))

    const { exchangeOAuthCode } = await import('@/modules/auth')

    await expect(exchangeOAuthCode('code-1', 'state-1')).rejects.toThrow(/PKCE code verifier/i)
    expect(apiFetch).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBe('state-1')
    expect(sessionStorage.getItem(OAUTH_VERIFIER_KEY)).toBeNull()
  })

  it('preserves PKCE state when token exchange fails', async () => {
    seedPkceState()
    const apiFetch = vi.fn().mockRejectedValue(new Error('backend unavailable'))
    vi.doMock('~/lib/api/client', () => ({ apiFetch }))

    const { exchangeOAuthCode } = await import('@/modules/auth')

    await expect(exchangeOAuthCode('code-1', 'state-1')).rejects.toThrow(/backend unavailable/i)
    expect(sessionStorage.getItem(OAUTH_STATE_KEY)).toBe('state-1')
    expect(sessionStorage.getItem(OAUTH_VERIFIER_KEY)).toBe('verifier-1')
  })
})
