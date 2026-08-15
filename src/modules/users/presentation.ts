/**
 * User presentation rules and the role/permission matrix data.
 *
 * Two things the users page used to hold inline. Neither is about the URL, and
 * the matrix in particular is a domain question — "which permissions exist, and
 * which roles hold them" — that any screen showing roles needs the same answer
 * to.
 */
import { ROLE_DEFINITIONS, getRegisteredPermissions, resolveRolePermissions } from '~/lib/rbac'
import type { BuiltinPermission, IconName, Role } from '~/types'

/**
 * Role badge tints.
 *
 * Deliberately a fixed ramp rather than theme tokens: the point is to tell six
 * roles apart at a glance in a legend and a table cell, and a themed ramp would
 * collapse several of them onto the same hue. The role name is always rendered
 * alongside, so the colour never carries the meaning alone.
 */
const ROLE_BADGE_CLASS: Record<Role, string> = {
  super_admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  admin: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  member: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  viewer: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  guest: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400',
}

export function roleBadgeClass(role: Role): string {
  return ROLE_BADGE_CLASS[role]
}

/** Identity-provider marks. An account with no provider signed up with a password. */
const PROVIDER_ICON: Record<string, IconName> = {
  credentials: 'lock',
  google: 'letter',
  github: 'code',
  microsoft: 'monitor',
}

export function providerIcon(provider: string | undefined): IconName {
  return PROVIDER_ICON[provider ?? 'credentials'] ?? 'lock'
}

export function providerLabel(provider: string | undefined): string {
  return provider ?? 'credentials'
}

/** Every role, in the registry's own order — the matrix columns. */
export function matrixRoles() {
  return Object.values(ROLE_DEFINITIONS)
}

/**
 * Every permission the matrix should list, sorted.
 *
 * `super_admin`'s grant plus anything a module registered at runtime: a module
 * that adds a permission no role holds yet still needs a row, otherwise the
 * matrix quietly claims the permission does not exist.
 */
export function matrixPermissions(): BuiltinPermission[] {
  const permissions = new Set<string>([
    ...resolveRolePermissions('super_admin'),
    ...getRegisteredPermissions(),
  ])
  return [...permissions].sort() as BuiltinPermission[]
}
