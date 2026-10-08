import { tryGetRbacConfig, type RbacConfig } from '~/lib/runtime'

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
 *
 * It imports no logger either, and nothing else that needs a bundler. The e2e
 * helpers import `inheritance.ts` straight into Node, where `import.meta.env`
 * does not exist; what is reported about a name lives in `unknown-names.ts`.
 */

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
