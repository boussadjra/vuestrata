import type { User } from '~/types'

import { appConfig } from '../config/app.config'
import { clearStore, deleteRecord } from './demo-persistence'
import { broadcastInvalidation, readEnvelope, writeEnvelope } from './demo-storage'

export type DemoSession = {
  user: User
  token: string
  refreshToken: string
  expiresIn: number
}

export const DEFAULT_DEMO_PERMISSIONS = [
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
  'reports:read',
  'reports:create',
  'reports:export',
  'audit:read',
] as const

export const DEFAULT_DEMO_USERS: User[] = [
  {
    id: '1',
    email: 'demo@vuestrata.dev',
    name: 'Demo Admin',
    role: 'super_admin',
    permissions: [...DEFAULT_DEMO_PERMISSIONS],
    emailVerified: true,
    mfaEnabled: false,
    provider: 'credentials',
    createdAt: new Date(0).toISOString(),
    lastLoginAt: new Date(0).toISOString(),
  },
]

export async function getDemoUsers(): Promise<User[]> {
  return (await readEnvelope<User[]>('users', 'list')) ?? []
}

export async function ensureDefaultDemoUsers(): Promise<User[]> {
  const users = await getDemoUsers()
  if (users.length > 0) return users
  await setDemoUsers(DEFAULT_DEMO_USERS)
  return DEFAULT_DEMO_USERS
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
