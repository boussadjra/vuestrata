/**
 * Tests for demo-store (getDemoUsers, setDemoUsers, getDemoSession, clearDemoSession, clearAllDemoData).
 * Uses fake-indexeddb so real IndexedDB APIs are available in Node.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'

import type { User } from '@/types'

function resetGlobals() {
  const g = globalThis as Record<string, unknown>
  delete g['__vuestrataDemoPersistence']
  delete g['__vuestrataDemoStorage']
}

const mockUser: User = {
  id: 'u1',
  name: 'Alice',
  email: 'alice@example.com',
  role: 'member',
  emailVerified: true,
  permissions: [],
  provider: 'credentials',
  lastLoginAt: new Date().toISOString(),
}

beforeEach(async () => {
  resetGlobals()
  // Clear seeded data (resetRuntimeState in setup.ts seeds the super admin)
  const { clearAllDemoData } = await import('@/modules/app/state/demo-store')
  await clearAllDemoData()
})
afterEach(() => resetGlobals())

describe('getDemoUsers — empty store', () => {
  it('returns an empty array initially', async () => {
    const { getDemoUsers } = await import('@/modules/app/state/demo-store')
    expect(await getDemoUsers()).toEqual([])
  })
})

describe('setDemoUsers / getDemoUsers — round-trip', () => {
  it('persists and retrieves users', async () => {
    const { getDemoUsers, setDemoUsers } = await import('@/modules/app/state/demo-store')
    await setDemoUsers([mockUser])
    const users = await getDemoUsers()
    expect(users).toHaveLength(1)
    expect(users.at(0)?.email).toBe('alice@example.com')
  })
})

describe('getDemoSession — null when empty', () => {
  it('returns null when no session exists', async () => {
    const { getDemoSession } = await import('@/modules/app/state/demo-store')
    expect(await getDemoSession()).toBeNull()
  })
})

describe('setDemoSession / getDemoSession — round-trip', () => {
  it('persists and retrieves the session', async () => {
    const { getDemoSession, setDemoSession } = await import('@/modules/app/state/demo-store')
    const session = { user: mockUser, token: 'tok', refreshToken: 'ref', expiresIn: 3600 }
    await setDemoSession(session)
    const result = await getDemoSession()
    expect(result).not.toBeNull()
    expect(result!.token).toBe('tok')
    expect(result!.user.id).toBe('u1')
  })
})

describe('clearDemoSession', () => {
  it('clears only the session, not users', async () => {
    const { getDemoSession, setDemoSession, clearDemoSession, setDemoUsers, getDemoUsers } =
      await import('@/modules/app/state/demo-store')
    await setDemoUsers([mockUser])
    await setDemoSession({ user: mockUser, token: 'tok', refreshToken: 'ref', expiresIn: 3600 })
    await clearDemoSession()
    expect(await getDemoSession()).toBeNull()
    expect(await getDemoUsers()).toHaveLength(1)
  })
})

describe('clearAllDemoData', () => {
  it('removes both users and session', async () => {
    const { clearAllDemoData, setDemoUsers, setDemoSession, getDemoUsers, getDemoSession } =
      await import('@/modules/app/state/demo-store')
    await setDemoUsers([mockUser])
    await setDemoSession({ user: mockUser, token: 'tok', refreshToken: 'ref', expiresIn: 3600 })
    await clearAllDemoData()
    expect(await getDemoUsers()).toEqual([])
    expect(await getDemoSession()).toBeNull()
  })
})
