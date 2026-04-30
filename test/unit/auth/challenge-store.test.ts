import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { useAuthChallengeStore } from '@/modules/auth/stores/challenge'

const LOCKOUT_STORAGE_KEY = 'vuestrata-auth-lockout'

function createStore() {
  setActivePinia(createPinia())
  return useAuthChallengeStore()
}

beforeEach(() => {
  sessionStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('auth challenge store — lockout persistence', () => {
  it('starts unlocked with zero attempts when storage is empty', () => {
    const store = useAuthChallengeStore()

    expect(store.loginAttempts).toBe(0)
    expect(store.lockedUntil).toBeNull()
    expect(store.isLockedOut()).toBe(false)
  })

  it('hydrates valid lockout state from sessionStorage', () => {
    const lockedUntil = Date.now() + 60_000
    sessionStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify({ attempts: 4, lockedUntil }))

    const store = createStore()

    expect(store.loginAttempts).toBe(4)
    expect(store.lockedUntil).toBe(lockedUntil)
  })

  it('ignores corrupt persisted lockout state', () => {
    sessionStorage.setItem(LOCKOUT_STORAGE_KEY, '{broken')

    const store = createStore()

    expect(store.loginAttempts).toBe(0)
    expect(store.lockedUntil).toBeNull()
  })

  it('records failed attempts and locks on the fifth attempt', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const store = useAuthChallengeStore()

    for (let attempt = 1; attempt < 5; attempt++) {
      expect(store.recordFailedAttempt()).toEqual({ lockedOut: false })
    }

    expect(store.recordFailedAttempt()).toEqual({ lockedOut: true })
    expect(store.loginAttempts).toBe(5)
    expect(store.lockedUntil).toBe(now + 60_000)
    expect(JSON.parse(sessionStorage.getItem(LOCKOUT_STORAGE_KEY) ?? '{}')).toMatchObject({
      attempts: 5,
      lockedUntil: now + 60_000,
    })
  })

  it('expires lockout when time has passed', () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const store = useAuthChallengeStore()
    for (let attempt = 0; attempt < 5; attempt++) store.recordFailedAttempt()

    vi.spyOn(Date, 'now').mockReturnValue(now + 60_001)

    expect(store.isLockedOut()).toBe(false)
    expect(store.loginAttempts).toBe(0)
    expect(store.lockedUntil).toBeNull()
  })

  it('resetAttempts clears attempts and persisted lockout', () => {
    const store = useAuthChallengeStore()
    store.recordFailedAttempt()
    store.resetAttempts()

    expect(store.loginAttempts).toBe(0)
    expect(store.lockedUntil).toBeNull()
    expect(JSON.parse(sessionStorage.getItem(LOCKOUT_STORAGE_KEY) ?? '{}')).toMatchObject({
      attempts: 0,
      lockedUntil: null,
    })
  })
})

describe('auth challenge store — MFA state', () => {
  it('sets and clears an in-memory MFA challenge', () => {
    const store = useAuthChallengeStore()

    store.setMfaChallenge('mfa-token')
    expect(store.mfaRequired).toBe(true)
    expect(store.mfaToken).toBe('mfa-token')

    store.clearMfaChallenge()
    expect(store.mfaRequired).toBe(false)
    expect(store.mfaToken).toBeNull()
  })
})
