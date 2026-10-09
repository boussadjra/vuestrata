import { hashFor } from '../../src/lib/lockfile.mjs'
import { inSlot } from '../../src/lib/manifest.mjs'
import { PRISTINE } from './promotions.mjs'
import { replaceBlocks, withoutComments } from './text.mjs'

/**
 * A user may hold several roles from 1.1.0, and two of the project's own files
 * are where that has to be said.
 *
 * Neither change is needed for the upgrade to compile or for a project with one
 * role per user to behave as it did: the route guard takes `roles` as an
 * optional member, and Vuestrata's own code reads a user's `roles` without
 * asking the `User` type for it. They are what makes a SECOND role count where
 * the project's files are in the path:
 *
 *   plugins/router.ts    hands the guard the user's roles, so `meta.requiredRole`
 *                        is met by any of them and not by the primary one alone
 *   app/types/index.ts   gives `User` the `roles` member, so the project's own
 *                        code can read it
 *
 * As everywhere in this migration, text is replaced only where it is exactly
 * what 1.0.1-alpha.5 and 1.0.1-alpha.6 shipped (they agree on both), and a file
 * that already says `roles` in its own way is left alone without a word.
 */

const inApp = (rel) => (manifest) => inSlot(manifest, 'appDir', rel)

// ─── plugins/router.ts ───────────────────────────────────────────────────────

const AUTH_STORE = 'src/modules/app/stores/auth.ts'
const authStoreFile = inApp('stores/auth.ts')

const SUBJECT_OLD = `    role: authStore.userRole,
    permissions: authStore.userPermissions as Permission[] | undefined,
`

const SUBJECT_NEW = `    role: authStore.userRole,
    roles: authStore.userRoles,
    permissions: authStore.userPermissions as Permission[] | undefined,
`

/** The file calls the guard, and nothing in its code says `roles`. */
const guardLacksRoles = (source) => {
  const code = withoutComments(source)
  return /\bresolveRouteAccess\s*\(/.test(code) && !/\broles\b/.test(code)
}

/**
 * Where the auth store stands: `current` when it has `userRoles`, or is a
 * release's copy that this same upgrade adopts and replaces with one that has;
 * `kept` when the project edited it and keeps it; `absent` when there is no
 * store where the template has one, and nothing can be said about it.
 *
 * `authStore.userRoles` on a kept store is a property that does not exist: a
 * type error, written by the upgrade, in a file that compiled.
 */
function authStoreState(manifest, ws) {
  const rel = authStoreFile(manifest)
  if (!ws.exists(rel)) return 'absent'

  const source = ws.read(rel)
  if (/\buserRoles\b/.test(withoutComments(source))) return 'current'
  return PRISTINE[AUTH_STORE].includes(hashFor(AUTH_STORE, source, 'managed')) ? 'current' : 'kept'
}

const guardRoles = {
  file: inApp('plugins/router.ts'),
  pending: (source, manifest, ws) =>
    guardLacksRoles(source) && authStoreState(manifest, ws) !== 'absent',
  apply: (source, manifest, ws) =>
    authStoreState(manifest, ws) === 'current'
      ? replaceBlocks(source, [{ from: SUBJECT_OLD, to: SUBJECT_NEW }])
      : source,
  // The note step below says which of the two reasons it was.
  note: false,
}

const guardRolesNote = {
  kind: 'note',
  file: inApp('plugins/router.ts'),
  pending: (source, manifest, ws) =>
    guardLacksRoles(source) && authStoreState(manifest, ws) !== 'absent',
  note: (source, manifest, ws) => {
    const why =
      'A user may now hold several roles (`roles` beside `role`), and the route guard meets ' +
      '`meta.requiredRole` with any of them only when it is handed the list. Until then it ' +
      'judges the primary role alone: stricter than the user’s roles allow, never looser, and ' +
      'not what `useRbac().isAtLeast()` answers for the same user.'

    if (authStoreState(manifest, ws) === 'kept') {
      return (
        `plugins/router.ts was left as it is, because ${authStoreFile(manifest)} is a copy you ` +
        `edited and keep, and it has no \`userRoles\` yet. ${why} Once you have merged the ` +
        'incoming store and run `vuestrata adopt`, run `vuestrata upgrade` again, or add ' +
        '`roles: authStore.userRoles,` to the object passed to resolveRouteAccess().'
      )
    }
    return (
      'plugins/router.ts is yours, and its call to resolveRouteAccess() is not the one ' +
      `1.0.1-alpha.6 shipped, so it was left alone. ${why} Add \`roles: authStore.userRoles,\` ` +
      'to the object passed to resolveRouteAccess(), beside `role`.'
    )
  },
}

// ─── app/types/index.ts ──────────────────────────────────────────────────────

const USER_OLD = `  role: Role
  permissions?: Permission[]
  emailVerified?: boolean
`

const USER_NEW = `  role: Role
  /**
   * Every role the user holds, when the backend sends more than one. \`role\`
   * stays the primary one: what to show, and what single-role code reads.
   */
  roles?: Role[]
  permissions?: Permission[]
  emailVerified?: boolean
`

/** The body of `interface User { … }`, comments blanked, or `undefined` without one. */
function userInterface(source) {
  const code = withoutComments(source)
  const start = /\binterface\s+User\s*\{/.exec(code)
  if (!start) return undefined

  const open = start.index + start[0].length
  let depth = 1
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}' && --depth === 0) return code.slice(open, i)
  }
  return undefined
}

/** `User` is declared here and has no `roles` member of any type. */
const userLacksRoles = (source) => {
  const body = userInterface(source)
  return body !== undefined && !/(?:^|[\s;,{])(['"]?)roles\1\s*\??\s*:/.test(body)
}

const userRoles = {
  slot: 'appTypes',
  pending: userLacksRoles,
  apply: (source) => replaceBlocks(source, [{ from: USER_OLD, to: USER_NEW }]),
  note:
    'app/types/index.ts is yours, and its `User` interface is not the one 1.0.1-alpha.6 ' +
    'shipped, so it was left alone. A user may now carry `roles` (every role they hold) beside ' +
    '`role`. Vuestrata reads it without the type; your own code can only once `User` declares ' +
    'it: add `roles?: Role[]` to the interface.',
}

export default {
  description:
    'a user may hold several roles: the router hands them to the guard, and User has `roles`',
  steps: [guardRoles, guardRolesNote, userRoles],
}
