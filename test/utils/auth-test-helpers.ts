import { createPinia, setActivePinia } from 'pinia'

import { clearAllDemoData, getDemoSession, setDemoSession, setDemoUsers } from '@/state/demo-store'
import type { DemoSession } from '@/state/demo-store'
import type { Permission, Role, User } from '@/types'

const DEMO_GLOBAL_KEYS = ['__vuestrataDemoPersistence', '__vuestrataDemoStorage'] as const

/**
 * A fully privileged fixture, covering only permissions the template itself
 * owns.
 *
 * Deliberately excludes the demo modules' permissions (`customers:*`,
 * `reports:read`, …). `vuestrata eject` withdraws those along with the modules
 * that declared them, and a shared helper that names them would stop compiling
 * in every project that ejected — a failure in a file nobody on that project
 * ever opened. Tests that need a demo permission should name it themselves.
 */
export const ALL_TEST_PERMISSIONS: Permission[] = [
  'users:read',
  'users:create',
  'users:update',
  'users:delete',
  'roles:read',
  'roles:assign',
  'billing:read',
  'billing:manage',
  'dashboard:read',
  'dashboard:export',
  'settings:read',
  'settings:update',
  'reports:create',
  'audit:read',
]

export function resetDemoGlobals(): void {
  const root = globalThis as Record<string, unknown>
  for (const key of DEMO_GLOBAL_KEYS) {
    delete root[key]
  }
}

export async function resetDemoData(): Promise<void> {
  resetDemoGlobals()
  await clearAllDemoData()
  resetDemoGlobals()
}

export function activateTestPinia(): void {
  setActivePinia(createPinia())
}

export function createAuthTestUser(overrides: Partial<User> = {}): User {
  const role = overrides.role ?? 'member'
  return {
    id: overrides.id ?? `user-${crypto.randomUUID()}`,
    name: overrides.name ?? 'Test User',
    email: overrides.email ?? `user-${crypto.randomUUID()}@example.test`,
    role,
    emailVerified: overrides.emailVerified ?? true,
    provider: overrides.provider ?? 'credentials',
    createdAt: overrides.createdAt ?? new Date(0).toISOString(),
    lastLoginAt: overrides.lastLoginAt ?? new Date(0).toISOString(),
    ...overrides,
  }
}

export function createSession(user: User, overrides: Partial<DemoSession> = {}): DemoSession {
  return {
    user,
    token: overrides.token ?? `access-${user.id}`,
    refreshToken: overrides.refreshToken ?? `refresh-${user.id}`,
    expiresIn: overrides.expiresIn ?? 3600,
  }
}

export async function seedDemoUsers(users: User[]): Promise<void> {
  await setDemoUsers(users)
}

export async function seedDemoSession(user: User, overrides: Partial<DemoSession> = {}) {
  const session = createSession(user, overrides)
  await setDemoSession(session)
  return session
}

export async function expectDemoSessionUser(id: string): Promise<DemoSession> {
  const session = await getDemoSession()
  if (!session) throw new Error(`Expected demo session for user ${id}, got null`)
  if (session.user.id !== id) {
    throw new Error(`Expected demo session user ${id}, got ${session.user.id}`)
  }
  return session
}

export function createUserWithRole(role: Role, permissions?: Permission[]): User {
  return createAuthTestUser({ role, permissions })
}
