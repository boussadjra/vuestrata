import { resolveRolePermissions } from '~/lib/rbac/inheritance'
import { tryGetRegisteredPermissions } from '~/lib/rbac/registry'
import type { Permission } from '~/lib/rbac/types'
import type { User } from '~/types'

import { appConfig } from '../config/app.config'
import { clearStore, deleteRecord } from './demo-persistence'
import { broadcastInvalidation, readEnvelope, writeEnvelope } from './demo-storage'
import { DEMO_ACCOUNT } from './demo/account'

export type DemoSession = {
  user: User
  token: string
  refreshToken: string
  expiresIn: number
}

/**
 * Every permission the demo super-admin holds.
 *
 * The role hierarchy **plus** whatever the registered modules contributed at
 * runtime. The hierarchy alone is not enough: a module declares its permissions
 * in `config.permissions`, they reach the RBAC registry when the module
 * registers, and no role delta grants them. A demo admin built from
 * `resolveRolePermissions()` alone therefore cannot use the very feature the
 * module just added — the sidebar filters the entry out and the route guard
 * sends the page to `/403`.
 *
 * A function rather than a constant for two reasons: the RBAC backend only
 * exists once bootstrap reaches `installRuntimeBackends()`, and the registry
 * keeps growing until `setupModules()` has registered every module.
 */
export function demoSuperAdminPermissions(): Permission[] {
  const permissions = new Set<string>([
    ...resolveRolePermissions('super_admin'),
    ...tryGetRegisteredPermissions(),
  ])
  return [...permissions] as Permission[]
}

/** The demo super-admin, holding every permission that currently exists. */
export function createDemoSuperAdmin(overrides: Partial<User> = {}): User {
  const now = new Date().toISOString()
  return {
    id: '1',
    email: DEMO_ACCOUNT.email,
    name: DEMO_ACCOUNT.name,
    role: 'super_admin',
    permissions: demoSuperAdminPermissions(),
    emailVerified: true,
    mfaEnabled: false,
    provider: 'credentials',
    createdAt: now,
    lastLoginAt: now,
    ...overrides,
  }
}

/** The user list a cold demo store starts from. */
export function createDefaultDemoUsers(): User[] {
  return [createDemoSuperAdmin()]
}

export async function getDemoUsers(): Promise<User[]> {
  return (await readEnvelope<User[]>('users', 'list')) ?? []
}

export async function ensureDefaultDemoUsers(): Promise<User[]> {
  const users = await getDemoUsers()
  if (users.length > 0) return users
  const defaults = createDefaultDemoUsers()
  await setDemoUsers(defaults)
  return defaults
}

export async function setDemoUsers(users: User[]): Promise<void> {
  await writeEnvelope('users', 'list', users, appConfig.demoAuth.retentionHours)
}

export async function getDemoSession(): Promise<DemoSession | null> {
  return readEnvelope<DemoSession>('session', 'current')
}

export async function setDemoSession(session: DemoSession): Promise<void> {
  await writeEnvelope('session', 'current', session, appConfig.demoAuth.retentionHours)
}

export async function clearDemoSession(): Promise<void> {
  await deleteRecord('session', 'current')
  broadcastInvalidation('clear')
}

export async function clearAllDemoData(): Promise<void> {
  await Promise.all([clearStore('users'), clearStore('session')])
  broadcastInvalidation('clear')
}
