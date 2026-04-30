import { expect, type Page } from '@playwright/test'

export const DEMO_ADMIN_EMAIL = 'demo@vuestrata.dev'
export const DEMO_PASSWORD = 'password'

type DemoRole = 'super_admin' | 'admin' | 'manager' | 'member' | 'viewer' | 'guest'
type DemoProvider = 'credentials' | 'google' | 'github' | 'microsoft'

export type DemoUser = {
  id: string
  email: string
  name: string
  role: DemoRole
  permissions?: string[]
  emailVerified?: boolean
  mfaEnabled?: boolean
  provider?: DemoProvider
  createdAt?: string
  lastLoginAt?: string
}

export const ALL_DEMO_PERMISSIONS = [
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
]

export function createDemoUser(overrides: Partial<DemoUser> = {}): DemoUser {
  const now = new Date().toISOString()
  return {
    id: '1',
    email: DEMO_ADMIN_EMAIL,
    name: 'Demo Admin',
    role: 'super_admin',
    permissions: [...ALL_DEMO_PERMISSIONS],
    emailVerified: true,
    mfaEnabled: false,
    provider: 'credentials',
    createdAt: now,
    lastLoginAt: now,
    ...overrides,
  }
}

export async function logInAsDemoAdmin(page: Page): Promise<void> {
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(DEMO_ADMIN_EMAIL)
  await page.locator('#password').fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 10_000 })
  await waitForSignedInShell(page)
}

export async function waitForSignedInShell(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 30_000 })
}

export async function signOut(page: Page): Promise<void> {
  await waitForSignedInShell(page)
  await page.getByRole('button', { name: /sign out/i }).click({ force: true })
}

export async function expectLoggedOutTab(page: Page): Promise<void> {
  try {
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 5_000 })
    return
  } catch {
    await expect(page.locator('main h1').first()).toContainText('Sign in', { timeout: 30_000 })
  }
}

export async function seedDemoUsers(page: Page, users: DemoUser[]): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('#app')?.children.length)
  await page.evaluate(async (seedUsers) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vuestrata-demo-auth', 1)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains('users')) {
          database.createObjectStore('users', { keyPath: 'id' })
        }
        if (!database.objectStoreNames.contains('session')) {
          database.createObjectStore('session', { keyPath: 'key' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Failed to open demo DB'))
    })

    const serializedPayload = JSON.stringify(seedUsers)
    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${serializedPayload}:vuestrata-demo-v1`),
    )
    const integrityHash = Array.from(new Uint8Array(hashBuffer), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
    const now = Date.now()

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['users', 'session'], 'readwrite')
      transaction.objectStore('users').put({
        id: 'list',
        value: {
          version: 1,
          createdAt: now,
          expiresAt: now + 24 * 60 * 60 * 1000,
          integrityHash,
          payload: seedUsers,
        },
      })
      transaction.objectStore('session').clear()
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to seed demo DB'))
    })

    db.close()
  }, users)
}
