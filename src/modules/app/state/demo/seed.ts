import type { Permission, User } from '~/types'

import {
  createDefaultDemoUsers,
  demoSuperAdminPermissions,
  getDemoSession,
  getDemoUsers,
  setDemoSession,
  setDemoUsers,
} from '../demo-store'
import { DEMO_ACCOUNT } from './account'

/**
 * Seed the demo super-admin, and keep its grants current on every boot.
 *
 * This used to run unconditionally from `installRuntimeBackends()` — no dev
 * check, no adapter check — so every boot in every environment wrote a
 * super-admin holding every permission into IndexedDB, production included.
 * It now lives behind the demo boundary and is called from exactly one place:
 * the `__VUESTRATA_DEMO__` branch in main.ts, after `setupModules()`.
 *
 * Seeding once was not enough. The demo account's permission array is a
 * snapshot written into IndexedDB (and again into the session envelope) the
 * first time the store is cold, and it survives for `demoAuth.retentionHours`.
 * Add a module — or grant an existing role a new permission — and the stored
 * demo admin keeps the old set: its nav entries are filtered out of the sidebar
 * and its pages redirect to `/403` until the visitor clears site data, which is
 * not something a demo can ask of anyone. Reconciling on boot means the demo
 * account always holds every permission the running app knows about.
 */
export async function seedDemoSuperAdmin(): Promise<void> {
  const permissions = demoSuperAdminPermissions()
  const users = await getDemoUsers()

  if (users.length === 0) {
    await setDemoUsers(createDefaultDemoUsers())
    await refreshDemoSession(permissions)
    return
  }

  // Only the demo account is reconciled. Accounts registered through the demo's
  // own sign-up flow are the visitor's, and silently promoting them to
  // super_admin would misrepresent what a new user sees.
  const index = users.findIndex((user) => user.email === DEMO_ACCOUNT.email)
  if (index === -1) return

  const existing = users[index]!
  if (!needsRefresh(existing, permissions)) {
    await refreshDemoSession(permissions)
    return
  }

  const refreshed = withFullGrants(existing, permissions)
  await setDemoUsers(users.map((user, i) => (i === index ? refreshed : user)))
  await refreshDemoSession(permissions)
}

/** The stored user with its role and grants brought back up to date. */
function withFullGrants(user: User, permissions: Permission[]): User {
  return { ...user, role: 'super_admin', permissions }
}

function needsRefresh(user: User, permissions: Permission[]): boolean {
  if (user.role !== 'super_admin') return true
  const held = new Set(user.permissions ?? [])
  return permissions.some((permission) => !held.has(permission))
}

/**
 * Bring a signed-in demo session up to date too.
 *
 * `restoreSession()` reads the user straight out of the session envelope, so a
 * refreshed users list would never reach an already-signed-in visitor — they
 * would keep the permission set captured at login until they signed out and
 * back in.
 */
async function refreshDemoSession(permissions: Permission[]): Promise<void> {
  const session = await getDemoSession()
  if (!session || session.user.email !== DEMO_ACCOUNT.email) return
  if (!needsRefresh(session.user, permissions)) return

  await setDemoSession({ ...session, user: withFullGrants(session.user, permissions) })
}
