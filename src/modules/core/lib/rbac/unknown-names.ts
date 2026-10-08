import { createScopedLogger } from '~/lib/logger'
import { tryGetRbacBackend } from '~/lib/runtime'

/**
 * What the RBAC layer says, in development, about a name it was handed and
 * dropped. Kept out of `role-graph.ts`, which `inheritance.ts` reads and which
 * must load without a bundler.
 */

const rolesLogger = createScopedLogger('rbac:roles')

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
