import type { RbacConfig } from '~/lib/runtime'

import { BUILTIN_ROLES, isBuiltinRole } from './role-graph'
import type { AppRoles, DefinesDeclaredRoles, RbacOverrides, ResolvedProjectRole } from './types'

/**
 * Declare what a project changes about the permission model.
 *
 * An identity function: it exists so `app/config/rbac.overrides.ts` is
 * type-checked against `RbacOverrides` and reads the same as the other seams.
 * A release can add optional fields to `RbacOverrides` without breaking a copy
 * written against the old one.
 *
 * Once the project declares a role in `AppRoles`, the `roles` table is
 * required and must define it: a role that is declared and never defined would
 * type-check everywhere and be a role nothing recognises. `Declared` is the
 * program's `AppRoles` unless it is given, which is how that rule is tested
 * without declaring a role for the whole program.
 */
export function defineRbacOverrides<Declared = AppRoles>(
  overrides: RbacOverrides<Declared> & DefinesDeclaredRoles<Declared>,
): RbacOverrides<Declared> {
  return overrides
}

/** The file a mistake in the role table is reported against. */
const SOURCE = 'app/config/rbac.overrides.ts'

/** What `resolveProjectRoles` reads of a definition, whatever its declared type. */
interface LooseRole {
  inherits?: unknown
  labelKey?: unknown
  label?: unknown
  description?: unknown
  assignable?: unknown
}

const optionalString = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

/**
 * Check the project's roles and work out what each one inherits.
 *
 * A role is accepted only when its whole ancestry is sound: every parent is a
 * role, and no chain of `inherits` leads back to where it started. One that is
 * not is left out, with a message, and so is every role that inherits from it.
 * Left out means it is not a role at all: it holds nothing, whatever `grants`
 * gives it, and a user who has only that role holds nothing. A mistake here
 * must never make a role hold more than was written.
 *
 * Never throws: `state/runtime-backends.ts` resolves the seam while it is being
 * imported, where an exception would stop the app before it could show an
 * error. `assertRbacConfig` is what turns the messages into a failed boot.
 */
function resolveProjectRoles(table: unknown): {
  roles: Map<string, ResolvedProjectRole>
  problems: string[]
} {
  const roles = new Map<string, ResolvedProjectRole>()
  const problems: string[] = []
  if (typeof table !== 'object' || table === null) return { roles, problems }

  const definitions = new Map<string, LooseRole>()
  for (const [name, definition] of Object.entries(table)) {
    if (isBuiltinRole(name)) {
      problems.push(
        `"${name}" is a built-in role and cannot be redefined. Change what it holds with ` +
          '`grants` and `withdrawn`; its place in the hierarchy is fixed.',
      )
    } else if (typeof definition !== 'object' || definition === null) {
      problems.push(`the role "${name}" is not an object like { inherits: ['viewer'] }.`)
    } else {
      definitions.set(name, definition as LooseRole)
    }
  }

  // A name maps to `undefined` while it is being worked out, so meeting it
  // again is a cycle, and to `null` once it is rejected.
  const settled = new Map<string, readonly string[] | null | undefined>()
  // The roles a message already names as the one at fault.
  const explained = new Set<string>()

  function reject(name: string, problem?: string): null {
    if (problem) {
      problems.push(problem)
      explained.add(name)
    }
    settled.set(name, null)
    return null
  }

  function resolve(name: string, path: readonly string[]): readonly string[] | null {
    if (isBuiltinRole(name)) return BUILTIN_ROLES.slice(BUILTIN_ROLES.indexOf(name))

    const definition = definitions.get(name)
    if (!definition) return null

    if (settled.has(name)) {
      const known = settled.get(name)
      if (known !== undefined) return known

      const cycle = [...path.slice(path.indexOf(name)), name]
      for (const member of cycle) explained.add(member)
      problems.push(
        `the role "${name}" inherits from itself (${cycle.join(' → ')}). No role in that ` +
          'chain is usable until the cycle is broken.',
      )
      return null
    }
    settled.set(name, undefined)

    const parents = definition.inherits ?? []
    if (!Array.isArray(parents)) {
      return reject(
        name,
        `the role "${name}" needs \`inherits\` to be a list of roles, [] for none.`,
      )
    }

    const includes = [name]
    let sound = true
    for (const parent of parents as unknown[]) {
      const inherited = typeof parent === 'string' ? resolve(parent, [...path, name]) : null
      if (inherited) {
        for (const role of inherited) if (!includes.includes(role)) includes.push(role)
        continue
      }

      sound = false
      // A parent that is one of the project's roles has its own message.
      if (typeof parent !== 'string' || !definitions.has(parent)) {
        explained.add(name)
        problems.push(
          `the role "${name}" inherits from ${JSON.stringify(parent)}, which is not a role. ` +
            `The roles are ${BUILTIN_ROLES.join(', ')} and the ones defined under \`roles\`.`,
        )
      }
    }

    if (!sound) return reject(name)

    settled.set(name, includes)
    return includes
  }

  for (const [name, definition] of definitions) {
    const includes = resolve(name, [])
    if (!includes) continue

    roles.set(name, {
      name,
      inherits: (definition.inherits as unknown[] | undefined)?.map(String) ?? [],
      includes,
      labelKey: optionalString(definition.labelKey),
      label: optionalString(definition.label),
      description: optionalString(definition.description),
      assignable: definition.assignable !== false,
    })
  }

  // A role rejected only for what it inherits from is named too, once.
  for (const name of definitions.keys()) {
    if (roles.has(name) || explained.has(name)) continue
    problems.push(
      `the role "${name}" inherits from a role that is not usable, so it is not either.`,
    )
  }

  return { roles, problems }
}

/**
 * The shape the runtime slot holds: `grants` and `withdrawn` always present, so
 * readers never branch on `undefined`; `roles` and `problems` only when the
 * project defines a role, or got one wrong.
 */
export function resolveRbacOverrides<Declared = AppRoles>(
  overrides: RbacOverrides<Declared> = {},
): RbacConfig {
  const { roles, problems } = resolveProjectRoles(overrides.roles)

  return {
    grants: (overrides.grants ?? {}) as RbacConfig['grants'],
    withdrawn: overrides.withdrawn ?? [],
    ...(roles.size > 0 && { roles }),
    ...(problems.length > 0 && { problems }),
  }
}

/**
 * Refuse a configuration whose role table is wrong, naming the file.
 *
 * Called where the configuration is installed for the app, during `boot()`, so
 * the mistake is the boot-failure screen and a message in the console on the
 * first run, not a role that quietly holds nothing in production.
 */
export function assertRbacConfig(config: RbacConfig): void {
  const problems = config.problems ?? []
  if (problems.length === 0) return

  throw new Error(
    `${SOURCE}: ${problems.length === 1 ? 'a role is' : 'some roles are'} not usable. ` +
      problems.map((problem, index) => `(${index + 1}) ${problem}`).join(' '),
  )
}
