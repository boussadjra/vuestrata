import { defineStore } from 'pinia'

const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 60_000 // 1 minute
const LOCKOUT_STORAGE_KEY = 'vuestrata-auth-lockout'

type PersistedLockout = { attempts: number; lockedUntil: number | null }

function readPersistedLockout(): PersistedLockout {
  if (typeof sessionStorage === 'undefined') return { attempts: 0, lockedUntil: null }
  try {
    const raw = sessionStorage.getItem(LOCKOUT_STORAGE_KEY)
    if (!raw) return { attempts: 0, lockedUntil: null }
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as PersistedLockout).attempts === 'number'
    ) {
      const p = parsed as PersistedLockout
      const lu = typeof p.lockedUntil === 'number' ? p.lockedUntil : null
      if (lu && Date.now() >= lu) return { attempts: 0, lockedUntil: null }
      return { attempts: p.attempts, lockedUntil: lu }
    }
  } catch {
    // Corrupt entry — fall through to defaults.
  }
  return { attempts: 0, lockedUntil: null }
}

function writePersistedLockout(state: PersistedLockout): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // sessionStorage may be unavailable (private mode, quota); ignore.
  }
}

/**
 * Auth challenge state (lockout + MFA) lifted out of `useAuth.ts`'s module
 * scope into a Pinia store so that:
 *   - State is visible in Vue devtools.
 *   - Tests can reset it via `setActivePinia(createPinia())`.
 *   - Multiple `useAuth()` callers share a single, reactive source rather
 *     than separate closures.
 *
 * Lockout state survives a page refresh via sessionStorage (cleared when the
 * browser tab closes); MFA challenge state is in-memory only because the
 * verifier flow runs inside the same page session as `login()`.
 */
export const useAuthChallengeStore = defineStore('auth-challenge', () => {
  const initial = readPersistedLockout()

  const loginAttempts = ref(initial.attempts)
  const lockedUntil = ref<number | null>(initial.lockedUntil)
  const mfaRequired = ref(false)
  const mfaToken = ref<string | null>(null)

  const remainingLockoutMs = computed(() =>
    lockedUntil.value ? Math.max(0, lockedUntil.value - Date.now()) : 0,
  )

  function syncLockout(): void {
    writePersistedLockout({ attempts: loginAttempts.value, lockedUntil: lockedUntil.value })
  }

  function isLockedOut(): boolean {
    if (!lockedUntil.value) return false
    if (Date.now() >= lockedUntil.value) {
      lockedUntil.value = null
      loginAttempts.value = 0
      syncLockout()
      return false
    }
    return true
  }

  function recordFailedAttempt(): { lockedOut: boolean } {
    loginAttempts.value++
    let lockedOut = false
    if (loginAttempts.value >= MAX_LOGIN_ATTEMPTS) {
      lockedUntil.value = Date.now() + LOCKOUT_DURATION_MS
      lockedOut = true
    }
    syncLockout()
    return { lockedOut }
  }

  function resetAttempts(): void {
    loginAttempts.value = 0
    lockedUntil.value = null
    syncLockout()
  }

  function setMfaChallenge(token: string): void {
    mfaRequired.value = true
    mfaToken.value = token
  }

  function clearMfaChallenge(): void {
    mfaRequired.value = false
    mfaToken.value = null
  }

  return {
    loginAttempts,
    lockedUntil,
    mfaRequired,
    mfaToken,
    remainingLockoutMs,
    isLockedOut,
    recordFailedAttempt,
    resetAttempts,
    setMfaChallenge,
    clearMfaChallenge,
  }
})
