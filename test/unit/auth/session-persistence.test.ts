import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

/**
 * Refresh-token persistence.
 *
 * This is the one place in the app that may write a credential somewhere a
 * script can read it, so the behaviour of each mode is pinned rather than
 * assumed. The invariants that matter:
 *
 *   - `none` and `refresh-cookie` write NOTHING, ever
 *   - only the refresh token is ever persisted; access tokens never are
 *   - clearing removes the token from BOTH storage areas regardless of mode,
 *     so a configuration change cannot strand a live credential in a browser
 */

const KEY = 'vuestrata-refresh-token'

async function loadWithMode(mode: string) {
  vi.resetModules()
  vi.doMock('~/lib/config', () => ({ runtimeEnv: { sessionPersistence: mode } }))
  return import('~/lib/auth/session-persistence')
}

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})

afterEach(() => {
  vi.doUnmock('~/lib/config')
  vi.restoreAllMocks()
})

describe('mode: none', () => {
  it('persists nothing and reads nothing', async () => {
    const mod = await loadWithMode('none')

    mod.persistRefreshToken('refresh-1')

    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(mod.readPersistedRefreshToken()).toBeNull()
    expect(mod.persistsAcrossReload()).toBe(false)
  })
})

describe('mode: refresh-cookie', () => {
  it('writes nothing — the credential belongs to the browser', async () => {
    const mod = await loadWithMode('refresh-cookie')

    mod.persistRefreshToken('refresh-1')

    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(mod.usesRefreshCookie()).toBe(true)
    expect(mod.usesWebStorage()).toBe(false)
  })
})

describe('mode: session', () => {
  it('round-trips through sessionStorage only', async () => {
    const mod = await loadWithMode('session')

    mod.persistRefreshToken('refresh-1')

    expect(sessionStorage.getItem(KEY)).toBe('refresh-1')
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(mod.readPersistedRefreshToken()).toBe('refresh-1')
  })

  it('removes the entry when passed null', async () => {
    const mod = await loadWithMode('session')

    mod.persistRefreshToken('refresh-1')
    mod.persistRefreshToken(null)

    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(mod.readPersistedRefreshToken()).toBeNull()
  })

  it('treats an empty stored value as absent', async () => {
    const mod = await loadWithMode('session')
    sessionStorage.setItem(KEY, '')

    expect(mod.readPersistedRefreshToken()).toBeNull()
  })
})

describe('mode: local', () => {
  it('round-trips through localStorage only', async () => {
    const mod = await loadWithMode('local')

    mod.persistRefreshToken('refresh-1')

    expect(localStorage.getItem(KEY)).toBe('refresh-1')
    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(mod.readPersistedRefreshToken()).toBe('refresh-1')
  })
})

describe('clearPersistedRefreshToken', () => {
  it('clears both areas regardless of the configured mode', async () => {
    const mod = await loadWithMode('none')

    // Written under a PREVIOUS configuration: switching a deployment from
    // `local` to `none` must not leave a live refresh token in every existing
    // user's browser, and logout has to be able to clean it up.
    sessionStorage.setItem(KEY, 'left-over-session')
    localStorage.setItem(KEY, 'left-over-local')

    mod.clearPersistedRefreshToken()

    expect(sessionStorage.getItem(KEY)).toBeNull()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

describe('unavailable storage', () => {
  it('degrades to no persistence instead of throwing', async () => {
    const mod = await loadWithMode('local')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    // Losing reload survival is a degraded experience; throwing here would
    // break a login that has otherwise completely succeeded.
    expect(() => mod.persistRefreshToken('refresh-1')).not.toThrow()
  })

  it('returns null rather than throwing when reading fails', async () => {
    const mod = await loadWithMode('local')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(mod.readPersistedRefreshToken()).toBeNull()
  })
})
