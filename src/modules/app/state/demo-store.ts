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

export async function getDemoUsers(): Promise<User[]> {
  return (await readEnvelope<User[]>('users', 'list')) ?? []
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
