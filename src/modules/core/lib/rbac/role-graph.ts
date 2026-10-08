import { createScopedLogger } from '~/lib/logger'
import { tryGetRbacBackend, tryGetRbacConfig, type RbacConfig } from '~/lib/runtime'

import type { BuiltinRole, Role } from './types'

/**
 * Which roles exist, and which role holds what another does.
 *
 * The built-in six are a chain: each holds everything the ones below it hold.
 * A project's roles (`roles` in `app/config/rbac.overrides.ts`) hang off that
 * chain, or off each other, by naming what they inherit from. So "is this role
 * at least a manager?" is a question about ancestry, never about a position in
 * a list: a project role has no position.
 *
 * This file imports nothing from `inheritance.ts`, which reads it. It is new in
 * 1.1, so an upgrade always delivers it, while `inheritance.ts` is a file 1.0
 * told projects to edit and an edited copy is kept.
 */

const rolesLogger = createScopedLogger('rbac:roles')

/** The built-in roles, highest first: each holds what every role after it holds. */
export const BUILTIN_ROLES: readonly BuiltinRole[] = [
  'super_admin',
  'admin',
  'manager',
  'member',
  'viewer',
  'guest',
]

export function isBuiltinRole(name: unknown): name is BuiltinRole {
  return typeof name === 'string' && (BUILTIN_ROLES as readonly string[]).includes(name)
}

/**
 * Whether `name` is a role this app has: built-in, or defined by the project
 * and accepted. Anything else is not a role, whatever sent it: a name from an
 * identity provider, a typo from the backend, a role whose definition was
 * rejected.
 */
export function isKnownRole(
  name: unknown,
  config: RbacConfig | null = tryGetRbacConfig(),
): name is Role {
  return isBuiltinRole(name) || (typeof name === 'string' && config?.roles?.has(name) === true)
}

/** Every role the app has: the built-in ones, highest first, then the project's as defined. */
export function knownRoles(config: RbacConfig | null = tryGetRbacConfig()): Role[] {
  return [...BUILTIN_ROLES, ...(config?.roles?.keys() ?? [])] as Role[]
}

/**
 * `role` and every role it inherits from, itself first. Empty for a name that
 * is not a role, so whoever asks grants nothing for it.
 */
export function includedRoles(
  role: unknown,
  config: RbacConfig | null = tryGetRbacConfig(),
): readonly Role[] {
  if (typeof role !== 'string') return []

  const index = (BUILTIN_ROLES as readonly string[]).indexOf(role)
  if (index !== -1) return BUILTIN_ROLES.slice(index)

  return (config?.roles?.get(role)?.includes ?? []) as readonly Role[]
}

/** No more than this many names are remembered, so a hostile token cannot grow the set. */
const MAX_REPORTED_NAMES = 100
/** A name is quoted up to this length: enough to recognise it, not enough to flood the console. */
const MAX_REPORTED_LENGTH = 64

/**
 * Warn once per `key`, in development only.
 *
 * What was reported is remembered on the RBAC backend, so it is reset with it
 * and nothing is held at module scope. Without a backend (or with one built
 * before it kept the list) nothing is reported: the caller has already done
 * the safe thing, and this is only the explanation.
 */
export function reportRbacOnce(key: string, message: string | (() => string)): void {
  if (!import.meta.env.DEV) return

  const reported = tryGetRbacBackend()?.reportedNames
  if (!reported || reported.size >= MAX_REPORTED_NAMES || reported.has(key)) return
  reported.add(key)

  rolesLogger.warn(typeof message === 'function' ? message() : message)
}

/**
 * Say, once, that a role or permission name was ignored because the app does
 * not declare it.
 *
 * Development only: in production the name is dropped all the same and
 * nothing is logged. The line carries the name and nothing about whose it was.
 * A value that is not a string is described by its type.
 */
export function reportUnknownName(kind: 'role' | 'permission', name: unknown): void {
  if (!import.meta.env.DEV) return

  const shown =
    typeof name === 'string'
      ? JSON.stringify(name.slice(0, MAX_REPORTED_LENGTH))
      : `of type ${name === null ? 'null' : typeof name}`

  reportRbacOnce(`${kind} ${shown}`, () =>
    kind === 'role'
      ? `Ignored the role ${shown}: this app does not declare it, so it grants nothing. ` +
        'Define it in app/config/rbac.overrides.ts, or map it to one of your roles.'
      : `Ignored the permission ${shown}: this app does not declare it. Declare it in ` +
        'app/config/rbac.overrides.ts and grant it to a role, or list it in a module.',
  )
}
