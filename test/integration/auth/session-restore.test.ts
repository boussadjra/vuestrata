/**
 * Integration tests for session restoration from IndexedDB demo persistence.
 * Verifies that getDemoSession hydrates the auth store correctly and that
 * expired or corrupted envelopes are rejected.
 */
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types'

const mockUser: User = {
  id: 'u-session',
  name: 'Session User',
  email: 'session@example.com',
  role: 'admin',
  permissions: ['users:read', 'dashboard:read'],
  emailVerified: true,
  provider: 'credentials',
  lastLoginAt: new Date().toISOString(),
}

function resetGlobals() {
  const g = globalThis as Record<string, unknown>
  delete g['__vuestrataDemoPersistence']
  delete g['__vuestrataDemoStorage']
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetGlobals()
  vi.restoreAllMocks()
})

afterEach(() => {
  resetGlobals()
})

describe('session-restore — demo session written after setDemoSession', () => {
  it('getDemoSession returns the session that was set', async () => {
    const { setDemoSession, getDemoSession } = await import('@/modules/app/state/demo-store')
    const session = { user: mockUser, token: 'access', refreshToken: 'refresh', expiresIn: 3600 }
    await setDemoSession(session)
    const stored = await getDemoSession()
    expect(stored).not.toBeNull()
    expect(stored!.user.id).toBe('u-session')
    expect(stored!.token).toBe('access')
  })
})

describe('session-restore — hydrates auth store', () => {
  it('setAuth with stored session user makes store authenticated', async () => {
    const { setDemoSession, getDemoSession } = await import('@/modules/app/state/demo-store')
    await setDemoSession({ user: mockUser, token: 'tok', refreshToken: 'rtok', expiresIn: 3600 })

    const session = await getDemoSession()
    const auth = useAuthStore()
    if (session) {
      auth.setAuth(session.user, session.token, session.refreshToken)
    }

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.user?.id).toBe('u-session')
    expect(auth.userPermissions).toEqual(mockUser.permissions)
  })
})

describe('session-restore — expired envelope not authenticated', () => {
  it('expired getDemoSession returns null, auth store stays unauthenticated', async () => {
    const { setDemoSession, getDemoSession } = await import('@/modules/app/state/demo-store')
    await setDemoSession({ user: mockUser, token: 'tok', refreshToken: 'rtok', expiresIn: 3600 })

    // Advance time past expiry
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 30 * 60 * 60 * 1000)

    const session = await getDemoSession()
    const auth = useAuthStore()
    if (session) {
      auth.setAuth(session.user, session.token, session.refreshToken)
    }

    expect(session).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })
})

describe('session-restore — corrupted hash not authenticated', () => {
  it('tampered envelope returns null from getDemoSession', async () => {
    const { setDemoSession, getDemoSession, clearDemoSession } =
      await import('@/modules/app/state/demo-store')
    const { putRecord } = await import('@/modules/app/state/demo-persistence')

    await setDemoSession({ user: mockUser, token: 'tok', refreshToken: 'rtok', expiresIn: 3600 })

    // Corrupt the integrity hash in the stored envelope
    const tampered = {
      version: 1,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
      integrityHash: 'deadbeef',
      payload: { user: mockUser, token: 'tok', refreshToken: 'rtok', expiresIn: 3600 },
    }
    await putRecord('session', 'current', tampered)

    const session = await getDemoSession()
    expect(session).toBeNull()

    // Cleanup
    await clearDemoSession()
  })
})
