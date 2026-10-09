import { tryGetRbacConfig } from '~/lib/runtime'

import { buildRoleDefinitions, resolveRolePermissions } from './inheritance'
import { BUILTIN_ROLES } from './role-graph'
import type { ResolvedRoleDefinition, Role } from './types'

/**
 * Every role the app has, described for whatever lists or names roles: a role
 * picker, a legend, a permission matrix.
 *
 * `ROLE_DEFINITIONS` holds the built-in six and is built when the RBAC barrel
 * is imported, before the project's `rbac.overrides.ts` is installed. This is
 * read when it is called, so a role the project defines is in it.
 *
 * From `inheritance.ts` it takes only what 1.0 already exported: a project that
 * kept an edited copy of that file still compiles, and its own roles hold
 * nothing until it takes the new one.
 */

/** `billing_admin` → `Billing admin`: what to show for a role nobody labelled. */
function humanize(name: string): string {
  const words = name.replaceAll(/[_-]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name
}

/**
 * The built-in roles, highest first, then the project's in the order
 * `rbac.overrides.ts` defines them. `permissions` is resolved when read.
 */
export function getRoleDefinitions(): ResolvedRoleDefinition[] {
  const builtin = buildRoleDefinitions()

  const definitions: ResolvedRoleDefinition[] = BUILTIN_ROLES.map((name, index) => {
    const lower = BUILTIN_ROLES[index + 1]
    return {
      name,
      label: builtin[name].label,
      description: builtin[name].description,
      labelKey: `role_${name}`,
      builtin: true,
      inherits: lower ? [lower] : [],
      assignable: true,
      get permissions() {
        return resolveRolePermissions(name)
      },
    }
  })

  for (const role of tryGetRbacConfig()?.roles?.values() ?? []) {
    const name = role.name as Role
    definitions.push({
      name,
      label: role.label ?? humanize(role.name),
      description: role.description ?? '',
      labelKey: role.labelKey ?? `role_${role.name}`,
      builtin: false,
      inherits: role.inherits as readonly Role[],
      assignable: role.assignable,
      get permissions() {
        return resolveRolePermissions(name)
      },
    })
  }

  return definitions
}

/** The roles a role picker offers: every role not marked `assignable: false`. */
export function getAssignableRoles(): ResolvedRoleDefinition[] {
  return getRoleDefinitions().filter((role) => role.assignable)
}

/** The two functions of vue-i18n's `useI18n()` that naming a role needs. */
export interface RoleLabelTranslator {
  t: (key: string) => string
  te: (key: string) => boolean
}

/**
 * What to call a role on screen.
 *
 * The translation under its `labelKey` (`role_<name>` unless the project named
 * another) when the active locale has one, else its plain `label`. `core/lib`
 * may not import vue-i18n, so the caller hands in `t` and `te`:
 *
 *     const { t, te } = useI18n()
 *     roleLabel(user.role, { t, te })
 *
 * A name that is not a role is passed to `t` as before, so what an unknown role
 * shows does not change.
 */
export function roleLabel(role: string, i18n: RoleLabelTranslator): string {
  const definition = getRoleDefinitions().find((candidate) => candidate.name === role)
  const key = definition?.labelKey ?? `role_${role}`

  if (!definition || i18n.te(key)) return i18n.t(key)
  return definition.label
}
