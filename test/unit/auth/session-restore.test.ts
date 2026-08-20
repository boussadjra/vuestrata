import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { restoreSession, type SessionRestoreStore } from '@/plugins/session-restore'
import type { User } from '@/types'
import { AppError } from '~/lib/errors'

/**
 * Boot-time session recovery.
 *
 * These tests exist because the original implementation opened with
 * `if (!authStore.token) return` and nothing caught it. Tokens are held in
 * memory, so on a cold boot there is never a token at that point — the guard
 * made the entire restore unreachable for both real adapters and signed the
 * user out on every reload. Under cookie transport the session cookie was
 * still valid and the app never even asked.
 *
 * The first `describe` below is the direct regression guard for that.
 */

const user: User = {
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'admin',
  permissions: [],
} as unknown as User

function createStore(overrides: Partial<SessionRestoreStore> = {}) {
  const store = {
    token: null as string | null,
    setAuth: vi.fn(),
    setUser: vi.fn(),
    clearAuth: vi.fn(),
    ...overrides,
  }
  return store as SessionRestoreStore & typeof store
}

describe('cold boot (no token in memory)', () => {
  it('attempts to resume even though there is no token — the original bug', async () => {
    const store = createStore()
    const resumeSession = vi.fn().mockResolvedValue(null)

    await restoreSession({ store, getUser: vi.fn(), resumeSession })

    expect(resumeSession).toHaveBeenCalledOnce()
  })

  it('restores a bearer session from the resumed tokens', async () => {
    const store = createStore()

    await restoreSession({
      store,
      getUser: vi.fn(),
      resumeSession: vi
        .fn()
        .mockResolvedValue({ user, token: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 }),
    })

    expect(store.setAuth).toHaveBeenCalledWith(user, 'access-1', 'refresh-1', 900)
    expect(store.setUser).not.toHaveBeenCalled()
  })

  it('restores a cookie session with no token, and invents none', async () => {
    const store = createStore()

    await restoreSession({
      store,
      getUser: vi.fn(),
      // Cookie transport: the credential is an HttpOnly cookie, so the resumed
      // session carries a user and nothing else.
      resumeSession: vi.fn().mockResolvedValue({ user }),
    })

    expect(store.setUser).toHaveBeenCalledWith(user)
    // Calling setAuth here would mean fabricating a token, which is precisely
    // what would make `isAuthenticated` lie.
    expect(store.setAuth).not.toHaveBeenCalled()
  })

  it('does nothing when there is no session to resume', async () => {
    const store = createStore()

    await restoreSession({
      store,
      getUser: vi.fn(),
      resumeSession: vi.fn().mockResolvedValue(null),
    })

    expect(store.setAuth).not.toHaveBeenCalled()
    expect(store.setUser).not.toHaveBeenCalled()
    expect(store.clearAuth).not.toHaveBeenCalled()
  })

  it('tolerates an adapter that cannot resume at all', async () => {
    const store = createStore()

    await expect(restoreSession({ store, getUser: vi.fn() })).resolves.toBeUndefined()
    expect(store.setAuth).not.toHaveBeenCalled()
  })

  it('never calls getUser — there is no credential to present yet', async () => {
    const store = createStore()
    const getUser = vi.fn()

    await restoreSession({ store, getUser, resumeSession: vi.fn().mockResolvedValue(null) })

    expect(getUser).not.toHaveBeenCalled()
  })
})

describe('re-entry (token already in memory)', () => {
  it('refreshes the user record instead of resuming', async () => {
    const store = createStore({ token: 'access-1' })
    const resumeSession = vi.fn()

    await restoreSession({ store, getUser: vi.fn().mockResolvedValue(user), resumeSession })

    expect(store.setUser).toHaveBeenCalledWith(user)
    expect(resumeSession).not.toHaveBeenCalled()
  })

  it('clears the session when the credential is rejected', async () => {
    const store = createStore({ token: 'stale' })

    await restoreSession({
      store,
      getUser: vi.fn().mockRejectedValue(new AppError({ message: 'nope', status: 401 })),
    })

    expect(store.clearAuth).toHaveBeenCalledOnce()
  })

  it('keeps the session through a transient server failure', async () => {
    const store = createStore({ token: 'good' })

    await restoreSession({
      store,
      getUser: vi.fn().mockRejectedValue(new AppError({ message: 'oops', status: 503 })),
    })

    // A 5xx says the backend is unwell, not that the user is signed out. The
    // 401 interceptor catches a genuinely invalid token on the next request.
    expect(store.clearAuth).not.toHaveBeenCalled()
  })

  it('keeps the session through a network error with no status', async () => {
    const store = createStore({ token: 'good' })

    await restoreSession({
      store,
      getUser: vi.fn().mockRejectedValue(new Error('Failed to fetch')),
    })

    expect(store.clearAuth).not.toHaveBeenCalled()
  })
})

describe('demo branch', () => {
  it('restores from the demo store and skips the adapter entirely', async () => {
    const store = createStore()
    const resumeSession = vi.fn()
    const getUser = vi.fn()

    await restoreSession({
      store,
      getUser,
      resumeSession,
      loadDemoSession: vi
        .fn()
        .mockResolvedValue({ user, token: 'demo-1', refreshToken: 'demo-r', expiresIn: 3600 }),
    })

    expect(store.setAuth).toHaveBeenCalledWith(user, 'demo-1', 'demo-r', 3600)
    expect(resumeSession).not.toHaveBeenCalled()
    expect(getUser).not.toHaveBeenCalled()
  })

  it('does nothing when the demo store holds no session', async () => {
    const store = createStore()

    await restoreSession({
      store,
      getUser: vi.fn(),
      loadDemoSession: vi.fn().mockResolvedValue(null),
    })

    expect(store.setAuth).not.toHaveBeenCalled()
  })
})
