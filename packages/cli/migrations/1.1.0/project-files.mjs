import { hashFor } from '../../src/lib/lockfile.mjs'
import { inSlot } from '../../src/lib/manifest.mjs'
import { envPlugin, PRISTINE } from './promotions.mjs'
import {
  declaresBinding,
  jsonStringSpan,
  listOf,
  replaceBlocks,
  toLf,
  withoutComments,
} from './text.mjs'

/**
 * Changes 1.1.0 needs in files the project owns.
 *
 * An upgrade replaces what Vuestrata manages. These files are not that: the
 * router plugin, the login page, package.json, the docs and the tests are the
 * project's. But 1.1.0 changed behaviour that each of them depends on, and a
 * project that never touched the relevant lines should not have to read a
 * changelog to find out.
 *
 * Every step here replaces text only where it is exactly what 1.0.1-alpha.5 and
 * 1.0.1-alpha.6 shipped (the two releases agree on all of it), and leaves
 * anything else alone with a note that gives the change to make by hand. The
 * rest of the file is never read as shipped or edited: a project that added a
 * layout to router.ts still gets the afterEach fix.
 *
 * The rest of the file is read for one thing, though. A step that INSERTS
 * something (a declaration, an import, an option) first asks whether the file
 * already has it somewhere else, because the shipped lines being intact says
 * nothing about what a project wrote beside them. A second `const reason` or a
 * second import of the same name is a file that no longer compiles, written by
 * the upgrade. Such a file is left alone, and the note gives the change.
 */

const inApp = (rel) => (manifest) => inSlot(manifest, 'appDir', rel)
const inModules = (rel) => (manifest) => inSlot(manifest, 'modulesDir', rel)

// ─── package.json ────────────────────────────────────────────────────────────

/**
 * The step as every release wrote it: a whole command, last in the chain or
 * followed by another. With arguments after it, or first in the chain, it is
 * not that step any more, and cutting the name out would hand its arguments to
 * the command before it.
 */
const LOCK_CHECK = / && node scripts\/release\/check-template-lock\.mjs(?= &&|$)/g

function lintScript(source) {
  try {
    const lint = JSON.parse(source).scripts?.lint
    return typeof lint === 'string' ? lint : undefined
  } catch {
    return undefined // not JSON this step can reason about; `vp` will say so
  }
}

/**
 * `vpr lint` ended with the template-lock check, which compares the lockfile
 * with a pristine template: it fails on a project's first `add module`, on a
 * version bump, on an edited managed file. It is a maintainer gate now.
 *
 * The script is edited as text, so the rest of package.json keeps its
 * formatting and key order, and in the string that IS `scripts.lint`, found by
 * its place in the document. Looking for the script's text instead would edit
 * whichever script holds that text first: a `lint:ci` declared above `lint`
 * with the same command would lose the check, and `lint` would keep it.
 *
 * Every occurrence of the step goes in one pass. If the script still names the
 * check afterwards, in a form of its own, nothing is changed and the note says
 * so.
 */
const lintWithoutLockCheck = {
  file: 'package.json',
  pending: (source) => lintScript(source)?.includes('check-template-lock.mjs') ?? false,
  apply: (source) => {
    const lint = lintScript(source)
    if (!lint) return source

    const without = lint.replace(LOCK_CHECK, '')
    if (without === lint || without.includes('check-template-lock.mjs')) return source

    const span = jsonStringSpan(source, ['scripts', 'lint'])
    return span
      ? source.slice(0, span.start) + JSON.stringify(without) + source.slice(span.end)
      : source
  },
  note:
    'package.json: the `lint` script still runs scripts/release/check-template-lock.mjs, in a ' +
    'form the migration does not recognise. That check is for template maintainers: it fails ' +
    'in a project as soon as you generate a module, bump the version or edit a managed file. ' +
    'Remove that step from the script by hand. `vuestrata doctor` is what a project runs instead.',
}

// ─── plugins/router.ts ───────────────────────────────────────────────────────

const AFTER_EACH_OLD = `router.afterEach(() => {
  NProgress.done()
  // Chunks are loading again, so a LATER stale chunk (a second deploy in the
  // same session) should get its own reload rather than being suppressed by a
  // marker left over from this one.
  clearStaleChunkMarker()
})
`

const AFTER_EACH_NEW = `router.afterEach((_to, from, failure) => {
  NProgress.done()
  // Chunks are loading again, so a LATER stale chunk (a second deploy in the
  // same session) should get its own reload rather than being suppressed by a
  // marker left over from this one.
  //
  // Except on the navigation a page load starts with: after a stale-chunk
  // reload that is the page the visitor was already on, and it loading proves
  // nothing about the chunk that was missing. Clearing the marker there meant
  // a route whose chunk is really gone reloaded the page on every click and
  // never reached the error screen.
  //
  // And only for a navigation that arrived. This hook also runs for one that
  // did not (a guard refused it, a newer one replaced it, the visitor clicked
  // the link of the page they are on), and nothing loaded for those.
  if (!failure && from !== START_LOCATION) clearStaleChunkMarker()
})
`

const ON_ERROR_COMMENT_OLD = `  // comes back. See plugins/stale-chunk.ts for the reload-loop guard.
  handleStaleChunkError(error)
`

const ON_ERROR_COMMENT_NEW = `  // comes back. See plugins/stale-chunk.ts for the reload-loop guard.
  //
  // What a reload does not fix (a second failure, or an error that is not a
  // missing chunk at all) is shown by AppErrorBoundary, which listens to
  // \`router.onError\` as well; before the app has mounted it rejects
  // \`router.isReady()\`, and \`boot()\` shows the boot-failure screen.
  handleStaleChunkError(error)
`

/** The first value import from vue-router: `import { a, type B } from 'vue-router'`. */
const VUE_ROUTER_IMPORT = /^import\s*\{([^}]*)\}\s*from\s*(['"])vue-router\2[ \t]*(;?)/m

const PRINT_WIDTH = 100

/**
 * `text` with START_LOCATION among what it imports from vue-router, or
 * `undefined` when there is no value import to add it to. Written the way the
 * formatter would: on one line while it fits, else one name to a line, with the
 * value names ahead of the `type` ones as the shipped file has them. A
 * semicolon the statement ended on stays.
 *
 * A file that already binds the name, in this import or in another, is
 * returned as it is. And an import with a comment among its names is not
 * rewritten name by name, which would lose the comment: the name goes in
 * first, and the rest of the statement is not touched.
 */
export function importStartLocation(text) {
  if (declaresBinding(text, 'START_LOCATION')) return text

  const found = VUE_ROUTER_IMPORT.exec(text)
  if (!found) return undefined

  const [statement, clause, quote, semicolon] = found
  const multiline = clause.includes('\n')

  if (/\/[/*]/.test(clause)) {
    const first = multiline ? '{\n  START_LOCATION,' : '{ START_LOCATION,'
    return text.replace(statement, () => statement.replace('{', () => first))
  }

  const names = clause
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

  const firstType = names.findIndex((name) => name.startsWith('type '))
  names.splice(firstType === -1 ? names.length : firstType, 0, 'START_LOCATION')

  const from = `from ${quote}vue-router${quote}${semicolon}`
  const oneLine = `import { ${names.join(', ')} } ${from}`
  const rewritten =
    !multiline && oneLine.length <= PRINT_WIDTH
      ? oneLine
      : `import {\n${names.map((name) => `  ${name},`).join('\n')}\n} ${from}`

  return text.replace(statement, () => rewritten)
}

/** `if (<the two conditions, in either order>) clearStaleChunkMarker()`, braces or not. */
const NOT_FAILURE = String.raw`!\s*failure`
const NOT_FIRST = String.raw`(?:from\s*!==\s*START_LOCATION|START_LOCATION\s*!==\s*from)`
const GUARDED_CLEAR = new RegExp(
  String.raw`if\s*\(\s*(?:${NOT_FAILURE}\s*&&\s*${NOT_FIRST}|${NOT_FIRST}\s*&&\s*${NOT_FAILURE})\s*\)` +
    String.raw`\s*\{?\s*clearStaleChunkMarker\(\)`,
  'g',
)

/**
 * The marker is cleared somewhere without the guard: the 1.0 afterEach, or a
 * variant of it. Counted, not looked for: a file with the guarded call AND a
 * second hook that still clears unconditionally has the bug the guard fixes,
 * and one guarded call must not speak for both. Comments do not count; the
 * shipped file explains the call in three of them.
 */
const clearsMarkerUnguarded = (source) => {
  const code = withoutComments(source)
  const calls = code.match(/\bclearStaleChunkMarker\(\)/g)?.length ?? 0
  const guarded = code.match(GUARDED_CLEAR)?.length ?? 0
  return calls > guarded
}

const routerAfterEach = {
  file: inApp('plugins/router.ts'),
  pending: clearsMarkerUnguarded,
  apply: (source) => {
    const replaced = replaceBlocks(source, [
      { from: AFTER_EACH_OLD, to: AFTER_EACH_NEW },
      { from: ON_ERROR_COMMENT_OLD, to: ON_ERROR_COMMENT_NEW, optional: true },
    ])
    if (replaced === source) return source

    // The new call names START_LOCATION. Without the import the file does not
    // compile, so no import to extend means no change at all.
    const imported = importStartLocation(toLf(replaced))
    if (imported === undefined) return source
    return source.includes('\r\n') ? imported.replaceAll('\n', '\r\n') : imported
  },
  note:
    'plugins/router.ts is yours, and it calls clearStaleChunkMarker() in a hook that is not the ' +
    'router.afterEach 1.0.1-alpha.6 shipped, so it was left alone. A call without the guard ' +
    'clears the stale-chunk marker after every navigation, ' +
    'including the one a page load starts with and the ones that failed, so a route whose ' +
    'chunk is really gone reloads the page on every click and never reaches the error state. ' +
    "Import START_LOCATION from 'vue-router' and make the hook " +
    '`router.afterEach((_to, from, failure) => { NProgress.done(); if (!failure && from !== ' +
    'START_LOCATION) clearStaleChunkMarker() })`. Every call to clearStaleChunkMarker() in the ' +
    'file needs that condition.',
}

// ─── plugins/stale-chunk.ts ──────────────────────────────────────────────────

const MARK_OLD = `function markReloadAttempted(): void {
  try {
    sessionStorage.setItem(RELOAD_MARKER_KEY, String(Date.now()))
  } catch {
    // If we cannot record the attempt we must not reload — see above.
  }
}
`

const MARK_NEW = `/**
 * Record the attempt, and say whether it was recorded.
 *
 * \`false\` when the write was refused (quota exceeded, some private modes) or
 * did not stick. The caller must then not reload: a reload nothing remembers is
 * the unguarded loop this file exists to prevent, and for a first route it
 * starts by itself, with no click in between.
 */
function markReloadAttempted(): boolean {
  try {
    const at = String(Date.now())
    sessionStorage.setItem(RELOAD_MARKER_KEY, at)
    return sessionStorage.getItem(RELOAD_MARKER_KEY) === at
  } catch {
    return false
  }
}
`

const RELOAD_OLD = `  staleChunkLogger.warn(
    'A route chunk is missing, which usually means a new version was deployed while this tab ' +
      'was open. Reloading once to pick it up.',
    { err: error },
  )
  markReloadAttempted()
  reload()
  return true
`

const RELOAD_NEW = `  if (!markReloadAttempted()) {
    staleChunkLogger.error(
      'A route chunk is missing, and the reload that would fix it cannot be recorded in ' +
        'sessionStorage. Not reloading — an attempt nothing remembers would repeat for ever.',
      { err: error },
    )
    return false
  }

  staleChunkLogger.warn(
    'A route chunk is missing, which usually means a new version was deployed while this tab ' +
      'was open. Reloading once to pick it up.',
    { err: error },
  )
  reload()
  return true
`

const CLEAR_DOC_OLD = ` * Called after the first successful navigation: at that point chunks are
 * loading again, so a later stale chunk (a second deploy in the same session)
 * should be allowed its own reload rather than being suppressed by an old
 * marker.
 */
`

const CLEAR_DOC_NEW = ` * Called after the first navigation the visitor makes that succeeds: at that
 * point chunks are loading again, so a later stale chunk (a second deploy in
 * the same session) should be allowed its own reload rather than being
 * suppressed by an old marker.
 *
 * Not after the navigation a page load starts with. That one is the reload
 * itself coming back to the page the visitor was already on, which says
 * nothing about the chunk that was missing; clearing there let every click on
 * a broken route reload the page again, and "one attempt, then surface the
 * error" never got to its second half. \`router.afterEach\` makes the call.
 */
`

/** The file still reloads without knowing whether the attempt was recorded. */
const reloadsUnrecorded = (source) =>
  /\bfunction\s+markReloadAttempted\s*\(/.test(source) &&
  !(
    /\bfunction\s+markReloadAttempted\s*\(\s*\)\s*:\s*boolean\b/.test(source) &&
    /if\s*\(\s*!\s*markReloadAttempted\(\)\s*\)/.test(source)
  )

const staleChunkReload = {
  file: inApp('plugins/stale-chunk.ts'),
  pending: reloadsUnrecorded,
  apply: (source) =>
    replaceBlocks(source, [
      { from: MARK_OLD, to: MARK_NEW },
      { from: RELOAD_OLD, to: RELOAD_NEW },
      { from: CLEAR_DOC_OLD, to: CLEAR_DOC_NEW, optional: true },
    ]),
  note:
    'plugins/stale-chunk.ts is yours, and it is not the one 1.0.1-alpha.6 shipped, so it was ' +
    'left alone. It still reloads the page for a missing chunk when sessionStorage cannot ' +
    'record the attempt (quota exceeded, some private modes), which for a first route is a ' +
    'reload loop. Make markReloadAttempted() return a boolean: write the marker, read it back, ' +
    'return whether it matches, and return false from the catch. Then in ' +
    'handleStaleChunkError(), call it before the warning and stop when it fails: ' +
    '`if (!markReloadAttempted()) { staleChunkLogger.error(...); return false }`, leaving only ' +
    '`reload()` and `return true` after the warning.',
}

/**
 * AppErrorBoundary, which is managed, imports `isStaleChunkError` from this
 * file, which is not. The export has been there since the file was introduced.
 */
const staleChunkExport = {
  kind: 'note',
  file: inApp('plugins/stale-chunk.ts'),
  pending: (source) =>
    !/export\s+(?:async\s+)?(?:function|const|let|var)\s+isStaleChunkError\b/.test(source) &&
    !/export\s*\{[^}]*\bisStaleChunkError\b[^}]*\}/.test(source),
  note:
    'plugins/stale-chunk.ts no longer exports isStaleChunkError, which the error boundary this ' +
    'release installs (components/layout/AppErrorBoundary.vue) imports to tell a failed chunk ' +
    'from any other error. The build fails on that import until the file exports ' +
    '`isStaleChunkError(error: unknown): boolean` again.',
}

// ─── auth/pages/login.vue ────────────────────────────────────────────────────

const LOGIN_SCRIPT_OLD = `const notifications = useNotificationStore()
`

const LOGIN_SCRIPT_NEW = `const notifications = useNotificationStore()

// The session-expiry redirect (bootstrap/auth-wiring.ts) arrives here with
// \`?reason=expired\`. \`useAuth().login\` already returns the visitor to the
// \`redirect\` it carries once they sign in again.
const reason = useRouteQueryParam('reason')
const sessionExpired = computed(() => reason.value === 'expired')
`

const LOGIN_ERROR_OLD = `      <div
        v-if="error"
        class="border-danger-200 dark:border-danger-800 bg-destructive-subtle text-destructive mb-4 rounded-[var(--shape-radius-sm)] border p-3 text-sm"
      >
`

const LOGIN_NOTICE = `      <div
        v-if="sessionExpired"
        role="status"
        class="border-warning-200 dark:border-warning-800 bg-warning-subtle text-warning-800 dark:text-warning-200 mb-4 rounded-[var(--shape-radius-sm)] border p-3 text-sm"
      >
        {{ t('auth_session_expired') }}
      </div>

`

/** What the script block declares. A page that has either name already keeps its own. */
const LOGIN_BINDINGS = ['reason', 'sessionExpired']

const loginExpiredNotice = {
  file: inModules('auth/pages/login.vue'),
  // Decided by the message key, which is new in 1.1.0: a page that shows it, in
  // whatever markup, has the notice.
  pending: (source) => !source.includes('auth_session_expired'),
  apply: (source) =>
    // The notice calls `t`, which the shipped page takes from useI18n(). And
    // the two constants are new names in the page's script: one that already
    // reads `?reason=`, for a message of its own, would get them twice.
    /\{\s*t\s*[,}]/.test(source) && !LOGIN_BINDINGS.some((name) => declaresBinding(source, name))
      ? replaceBlocks(source, [
          { from: LOGIN_SCRIPT_OLD, to: LOGIN_SCRIPT_NEW },
          { from: LOGIN_ERROR_OLD, to: LOGIN_NOTICE + LOGIN_ERROR_OLD },
        ])
      : source,
  note:
    'src/modules/auth/pages/login.vue is yours, and it is not the page 1.0.1-alpha.6 shipped, ' +
    'so it was left alone. An expired session now arrives there as ' +
    '/auth/login?redirect=<path>&reason=expired, and the page should say why. In the script: ' +
    "`const reason = useRouteQueryParam('reason')` and " +
    "`const sessionExpired = computed(() => reason.value === 'expired')`. In the template, " +
    'above the error message: `<div v-if="sessionExpired" role="status">' +
    "{{ t('auth_session_expired') }}</div>`, styled like the error block with the warning " +
    'tokens. The key is in the en, fr and ar catalogs this release installs.',
}

// ─── Demo literals in files that ship in a production bundle ─────────────────

/**
 * What `verify-bundle.mjs --mode=production` rejects anywhere in the bundle
 * from 1.1.0. It used to exempt the docs chunks, and a chunk named `forms`.
 */
const DEMO_LITERALS = ['demo@vuestrata.dev', 'vuestrata-demo-auth', 'vuestrata-demo-v1']

const holdsDemoLiteral = (source) => DEMO_LITERALS.some((literal) => source.includes(literal))

/**
 * Each block stands alone: a page is fixed line by line, as far as it is still
 * shipped text. And wherever that text is: a page that quotes the line twice
 * has both fixed by this upgrade, not one now and one by the next.
 */
const literalCodemod = (file, blocks) => ({
  file,
  pending: holdsDemoLiteral,
  apply: (source) =>
    replaceBlocks(
      source,
      blocks.map((block) => ({ ...block, optional: true, all: true })),
    ),
  // One note for the four files, below.
  note: false,
})

const AUTH_RBAC_DOC = 'docs/6.configuration/2.auth-rbac.md'
const DEEP_DIVE_DOC = 'docs/6.configuration/3.auth-deep-dive.md'
const VERCEL_DOC = 'docs/8.deployment/1.vercel-demo.md'
const FORMS_PAGE = inModules('showcase/pages/forms.vue')

const demoLiterals = [
  literalCodemod(AUTH_RBAC_DOC, [
    {
      from: `| Email                | Password   | Role          |
| -------------------- | ---------- | ------------- |
| \`demo@vuestrata.dev\` | \`demo1234\` | \`super_admin\` |

Defined once in \`src/modules/app/state/demo/account.ts\` and imported by the
login-page hint, the MSW login handler, the seed routine, and the e2e helpers,
so they cannot drift apart.
`,
      to: `A demo build's login page shows the account's email and password under the
form. They are not repeated here: this page ships in production builds too,
where the credentials must not appear.

The account (\`DEMO_ACCOUNT\`, role \`super_admin\`) is defined once in
\`src/modules/app/state/demo/account.ts\` and imported by the login-page hint, the
MSW login handler, the seed routine, and the e2e helpers, so they cannot drift
apart.
`,
    },
    {
      from: `Demo sessions survive page reloads via IndexedDB (\`vuestrata-demo-auth\`
database). Each record is wrapped in an envelope carrying an \`integrityHash\`.
`,
      to: `Demo sessions survive page reloads via IndexedDB (the database named by
\`DEMO_DB_NAME\` in \`src/modules/app/state/demo-persistence.ts\`). Each record is
wrapped in an envelope carrying an \`integrityHash\`.
`,
    },
  ]),
  literalCodemod(DEEP_DIVE_DOC, [
    {
      from: "- Cross-tab sync via `BroadcastChannel('vuestrata-demo-auth')`.\n",
      to: '- Cross-tab sync via a `BroadcastChannel`, named by `DEMO_CHANNEL_NAME` in `demo-storage.ts`.\n',
    },
  ]),
  literalCodemod(VERCEL_DOC, [
    {
      from: 'Session state lives in IndexedDB under `vuestrata-demo-auth` and expires after\n',
      to:
        'Session state lives in IndexedDB, in the database named by `DEMO_DB_NAME` in\n' +
        '`src/modules/app/state/demo-persistence.ts`, and expires after\n',
    },
  ]),
  literalCodemod(FORMS_PAGE, [
    {
      from: "  email: 'demo@vuestrata.dev',\n",
      to:
        "  // Not the demo account's address: this page ships in production builds,\n" +
        '  // where verify-bundle.mjs rejects that address anywhere in the bundle.\n' +
        "  email: 'demo.user@example.com',\n",
    },
  ]),
  {
    // The spec asserts what the form is pre-filled with, so it follows the page
    // and never leads it: with the page left alone, these stay as they are.
    file: 'e2e/forms.spec.ts',
    pending: (source, manifest, ws) => {
      const page = FORMS_PAGE(manifest)
      return (
        source.includes("toHaveValue('demo@vuestrata.dev')") &&
        ws.exists(page) &&
        !ws.read(page).includes('demo@vuestrata.dev') &&
        ws.read(page).includes('demo.user@example.com')
      )
    },
    apply: (source) =>
      replaceBlocks(source, [
        {
          from: "toHaveValue('demo@vuestrata.dev')",
          to: "toHaveValue('demo.user@example.com')",
          all: true,
        },
      ]),
  },
  {
    kind: 'note',
    note: (source, manifest, ws) => {
      const left = [AUTH_RBAC_DOC, DEEP_DIVE_DOC, VERCEL_DOC, FORMS_PAGE(manifest)]
        .filter((rel) => ws.exists(rel))
        .map((rel) => ({
          rel,
          literals: DEMO_LITERALS.filter((literal) => ws.read(rel).includes(literal)),
        }))
        .filter((entry) => entry.literals.length > 0)
      if (left.length === 0) return undefined

      const where = left
        .map(
          (entry) => `${entry.rel} (${entry.literals.map((literal) => `"${literal}"`).join(', ')})`,
        )
        .join('; ')
      return (
        'From 1.1.0 `node scripts/build/verify-bundle.mjs --mode=production` searches every ' +
        'chunk, the in-app docs included, for the demo account and the demo store names, and ' +
        `fails when it finds one. These files still quote one, on a line that is no longer the ` +
        `shipped text, so they were left alone: ${where}. Reword those lines (name the constant ` +
        'that holds the value, such as DEMO_DB_NAME or DEMO_ACCOUNT, instead of the value), or ' +
        'the production bundle check fails.'
      )
    },
  },
]

// ─── Tests that pin what 1.1.0 changed ───────────────────────────────────────

/**
 * The template's tests are the project's files too, and a handful assert the
 * 1.0 behaviour of files that are replaced by this upgrade: an upgraded project
 * would fail `vpr test --run` on code it never wrote. Each entry replaces the
 * assertions as shipped, and `pins` recognises a copy that still asserts the
 * old behaviour in some other form, for the note.
 *
 * A test follows the file it tests and never leads it. Where the project
 * edited that file, it keeps its copy and the 1.0 behaviour (the promotion
 * leaves it, with a note), and its test is still right about it: rewriting the
 * test would make it fail on the project's own decision. `subject` names that
 * file, and the test is rewritten on the upgrade that replaces it, or on the
 * first one after the project merged the incoming copy.
 *
 * The new assertions bring names with them. `declares` lists the ones a rewrite
 * adds at module scope (a file that has one already is left alone, or it would
 * declare it twice), `uses` the ones it reads from the rest of the file (a file
 * that renamed its helper would get a call to nothing), and a block's `unless`
 * skips an import the file already has.
 */

/**
 * A file a test asserts the behaviour of: `key` is where it ships (and its key
 * in the promotions' pristine lists), `file` where this project has it, and
 * `marker` something only the 1.1.0 version says.
 */
const SUBJECTS = {
  authStore: {
    key: 'src/modules/app/stores/auth.ts',
    file: inApp('stores/auth.ts'),
    marker: 'resolveSubjectPermissions',
  },
  useRbac: {
    key: 'src/modules/app/composables/useRbac.ts',
    file: inApp('composables/useRbac.ts'),
    marker: 'resolveSubjectPermissions',
  },
  authEndpoints: {
    key: 'src/modules/auth/adapters/base.ts',
    file: inModules('auth/adapters/base.ts'),
    marker: 'skipAuthRefresh',
  },
}

/**
 * The subject has the 1.1.0 behaviour, or is about to: it is a release's copy,
 * which this same upgrade adopts and replaces. A project without the file has
 * nothing for the test to wait for.
 */
function subjectIsCurrent(subject, manifest, ws) {
  if (!subject) return true
  const rel = subject.file(manifest)
  if (!ws.exists(rel)) return true

  const source = ws.read(rel)
  return (
    source.includes(subject.marker) ||
    PRISTINE[subject.key].includes(hashFor(subject.key, source, 'managed'))
  )
}

const USE_RBAC_OLD = `  it('should default to guest role when no user is authenticated', () => {
    const { role, permissions } = useRbac()
    expect(role.value).toBe('guest')
    expect(permissions.value).toContain('dashboard:read')
  })
`

const USE_RBAC_NEW = `  it('should default to guest role, holding nothing, when no user is authenticated', () => {
    const { role, permissions, can } = useRbac()
    expect(role.value).toBe('guest')
    // What the guest ROLE grants is for a signed-in guest. A visitor who is not
    // signed in holds nothing — the answer the route guard always gave them.
    expect(permissions.value).toEqual([])
    expect(can('dashboard:read')).toBe(false)
  })

  it('should grant a signed-in guest what the guest role holds', () => {
    setupAuth({ role: 'guest' })
    const { permissions, can } = useRbac()
    expect(permissions.value).toContain('dashboard:read')
    expect(can('dashboard:read')).toBe(true)
  })
`

const useRbacTest = (file) => ({
  file,
  subject: SUBJECTS.useRbac,
  pins: (source) => source.includes("'should default to guest role when no user is authenticated'"),
  blocks: [{ from: USE_RBAC_OLD, to: USE_RBAC_NEW }],
  // The second test signs a guest in with the file's own helper.
  uses: ['setupAuth'],
  change:
    'a visitor who is not signed in holds no permission in useRbac(); what the guest role grants ' +
    'is for a signed-in guest',
})

const TESTS = [
  {
    file: 'test/stores.test.ts',
    subject: SUBJECTS.authStore,
    pins: (source) =>
      source.includes("'userPermissions is empty array when user has no permissions field'"),
    blocks: [
      {
        from: "import { useNotificationStore } from '@/stores/notification'\n",
        to:
          "import { useNotificationStore } from '@/stores/notification'\n" +
          "import { getRolePermissions } from '~/lib/rbac'\n",
        // A file that tests the role table too already imports it.
        unless: (text) => declaresBinding(text, 'getRolePermissions'),
      },
      {
        from: `  it('userPermissions is empty array when user has no permissions field', () => {
    const store = useAuthStore()
    store.setAuth({ id: '1', name: 'NoPerms', email: 'np@example.com', role: 'member' }, 'tok')
    expect(store.userPermissions).toEqual([])
  })
`,
        to: `  it('userPermissions derives from the role when the user has no permissions field', () => {
    const store = useAuthStore()
    store.setAuth({ id: '1', name: 'NoPerms', email: 'np@example.com', role: 'member' }, 'tok')
    // It used to be [] here, which the route guard read as "holds nothing"
    // while the sidebar fell back to the role.
    expect(store.userPermissions).toEqual(getRolePermissions('member'))
    expect(store.userPermissions).toContain('users:read')
  })

  it('userPermissions is empty when the backend sent an empty list', () => {
    const store = useAuthStore()
    store.setAuth(
      { id: '1', name: 'NoPerms', email: 'np@example.com', role: 'member', permissions: [] },
      'tok',
    )
    expect(store.userPermissions).toEqual([])
  })
`,
      },
    ],
    change:
      'useAuthStore().userPermissions is what the role grants when the user carries no ' +
      '`permissions`, and [] only when the backend sent an empty list',
  },
  useRbacTest('test/unit/composables/use-rbac.test.ts'),
  useRbacTest('test/integration/composables/use-rbac.test.ts'),
  {
    file: 'test/unit/auth/adapters.test.ts',
    subject: SUBJECTS.authEndpoints,
    pins: (source) =>
      /toHaveBeenCalledWith\('\/auth\/me'\)/.test(source) ||
      /toHaveBeenCalledWith\('\/auth\/login', \{\s*method:/.test(source),
    blocks: [
      {
        from: "    expect(apiFetch).toHaveBeenCalledWith('/auth/me')\n",
        to: "    expect(apiFetch).toHaveBeenCalledWith('/auth/me', { skipAuthRefresh: true })\n",
      },
      {
        from: `    expect(apiFetch).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
`,
        to: `    // A login is the authentication flow itself, so a 401 is its answer and the
    // client must not try to refresh in response.
    expect(apiFetch).toHaveBeenCalledWith('/auth/login', {
      skipAuthRefresh: true,
      method: 'POST',
`,
      },
    ],
    change: 'the jwt adapter passes `skipAuthRefresh: true` on every /auth/* request',
  },
  {
    file: 'test/unit/auth/oauth-pkce.test.ts',
    subject: SUBJECTS.authEndpoints,
    pins: (source) => /toHaveBeenCalledWith\('\/auth\/token', \{\s*method:/.test(source),
    blocks: [
      {
        from: `    expect(apiFetch).toHaveBeenCalledWith('/auth/token', {
      method: 'POST',
`,
        to: `    expect(apiFetch).toHaveBeenCalledWith('/auth/token', {
      skipAuthRefresh: true,
      method: 'POST',
`,
      },
    ],
    change: 'the oauth adapter passes `skipAuthRefresh: true` on the /auth/token exchange',
  },
  {
    file: 'test/unit/architecture/public-surface.test.ts',
    pins: (source) =>
      /^describe\('public surface'/m.test(source) && !source.includes('VUESTRATA_MAINTAINER'),
    blocks: [
      {
        from: ` * Updating the snapshot is normal. Updating it without the migration is not.
 */

const ROOT = process.cwd()
`,
        to: ` * Updating the snapshot is normal. Updating it without the migration is not.
 *
 * MAINTAINERS ONLY. The snapshots record this repository's own module list and
 * permission union, which is exactly what a project changes the first time it
 * runs \`add module\`. Run for a project, this would fail \`vp run test --run\` on
 * ordinary development. Set VUESTRATA_MAINTAINER=1 (the template's CI does).
 */

const MAINTAINER = process.env.VUESTRATA_MAINTAINER === '1'

const ROOT = process.cwd()
`,
      },
      {
        from: "describe('public surface', () => {\n",
        to: `// Always registered, so a run without the flag reports why this file did
// nothing instead of showing an empty suite.
it.skipIf(!MAINTAINER)('public surface: snapshots run for template maintainers', () => {
  expect(process.env.VUESTRATA_MAINTAINER).toBe('1')
})

describe.runIf(MAINTAINER)('public surface', () => {
`,
      },
    ],
    declares: ['MAINTAINER'],
    uses: ['it', 'expect', 'describe'],
    change:
      'the snapshots describe the modules and permissions of the template itself, so the suite ' +
      'runs ' +
      'only with VUESTRATA_MAINTAINER=1 (`describe.runIf(...)`); in a project it fails on the ' +
      'first generated module',
  },
  {
    file: 'test/unit/architecture/registry-drift.test.ts',
    pins: (source) =>
      source.includes('const catalogs = { en: enShell, fr: frShell, ar: arShell }') &&
      !source.includes('.overrides.json'),
    blocks: [
      {
        from: `import arShell from '@/locales/ar.json'
import enShell from '@/locales/en.json'
import frShell from '@/locales/fr.json'
`,
        to: `import arShell from '@/locales/ar.json'
import arOverrides from '@/locales/ar.overrides.json'
import enShell from '@/locales/en.json'
import enOverrides from '@/locales/en.overrides.json'
import frShell from '@/locales/fr.json'
import frOverrides from '@/locales/fr.overrides.json'
`,
      },
      {
        from: `    // Through \`unknown\`: the imported JSON has a precise literal-key type, so
    // TypeScript refuses the direct widening to an index signature.
    const catalogs = { en: enShell, fr: frShell, ar: arShell } as unknown as Record<
      string,
      Record<string, string>
    >
`,
        to: `    // Each catalog with the project's overrides on top, as \`plugins/i18n.ts\`
    // merges them: a project's own group is labelled in \`<locale>.overrides.json\`,
    // because the catalogs are Vuestrata's and an upgrade replaces them.
    // Through \`unknown\`: the imported JSON has a precise literal-key type, so
    // TypeScript refuses the direct widening to an index signature.
    const catalogs = {
      en: { ...enShell, ...enOverrides },
      fr: { ...frShell, ...frOverrides },
      ar: { ...arShell, ...arOverrides },
    } as unknown as Record<string, Record<string, string>>
`,
      },
    ],
    declares: ['arOverrides', 'enOverrides', 'frOverrides'],
    change:
      'the locale catalogs are replaced by upgrades, so a nav group of yours is labelled in ' +
      '`<locale>.overrides.json`; read each catalog with its overrides merged on top',
  },
  {
    file: 'test/unit/architecture/module-contract.test.ts',
    pins: (source) =>
      source.includes('const SHELL_KEYS = new Set(Object.keys(enShell))') &&
      !source.includes('.overrides.json'),
    blocks: [
      {
        from: "import enShell from '@/locales/en.json'\n",
        to:
          "import enShell from '@/locales/en.json'\n" +
          "import enOverrides from '@/locales/en.overrides.json'\n",
      },
      {
        from: 'const SHELL_KEYS = new Set(Object.keys(enShell))\n',
        to:
          "// The catalog and the project's overrides, which `plugins/i18n.ts` merges into\n" +
          '// one: a shell key the project added lives in `en.overrides.json`.\n' +
          'const SHELL_KEYS = new Set([...Object.keys(enShell), ...Object.keys(enOverrides)])\n',
      },
    ],
    declares: ['enOverrides'],
    change:
      'a module title or nav label of yours may live in `en.overrides.json`; count its keys ' +
      'with those of the catalog',
  },
]

/** The rewrite would declare a name the file has, or call one it has not. */
const cannotTake = (test, source) =>
  (test.declares ?? []).some((name) => declaresBinding(source, name)) ||
  (test.uses ?? []).some((name) => !declaresBinding(source, name))

const pinnedTests = [
  ...TESTS.map((test) => ({
    file: test.file,
    pending: (source, manifest, ws) =>
      test.pins(source) && subjectIsCurrent(test.subject, manifest, ws),
    apply: (source) => (cannotTake(test, source) ? source : replaceBlocks(source, test.blocks)),
    note: false,
  })),
  {
    kind: 'note',
    note: (source, manifest, ws) => {
      const pinning = TESTS.filter((test) => ws.exists(test.file) && test.pins(ws.read(test.file)))
      // Still asserting 1.0 after the steps above: not the shipped text.
      const left = pinning.filter((test) => subjectIsCurrent(test.subject, manifest, ws))
      // Asserting 1.0 about a file that still does what 1.0 did.
      const waiting = pinning.filter((test) => !left.includes(test))
      const parts = []

      if (left.length > 0) {
        parts.push(
          `${listOf(left.map((test) => test.file))} still ` +
            `${left.length === 1 ? 'asserts' : 'assert'} what 1.0 did, in a form the migration ` +
            `does not recognise, so ${left.length === 1 ? 'it was' : 'they were'} left alone and ` +
            `will fail or mislead. What changed: ` +
            `${left.map((test) => `${test.file}: ${test.change}`).join('; ')}.`,
        )
      }

      if (waiting.length > 0) {
        const subjects = [...new Set(waiting.map((test) => test.subject.file(manifest)))]
        parts.push(
          `${listOf(waiting.map((test) => test.file))} ` +
            `${waiting.length === 1 ? 'was' : 'were'} left as ` +
            `${waiting.length === 1 ? 'it is' : 'they are'}, because ` +
            `${waiting.length === 1 ? 'it tests' : 'they test'} ${listOf(subjects)}, which you ` +
            `edited and keep: the 1.0 assertions still hold for your copy. Once you have merged ` +
            `the incoming version and run \`vuestrata adopt\`, run \`vuestrata upgrade\` again ` +
            `and the ${waiting.length === 1 ? 'test follows' : 'tests follow'}.`,
        )
      }

      return parts.length > 0 ? parts.join(' ') : undefined
    },
  },
]

// ─── vite.config.ts: room for the tests ──────────────────────────────────────

const TEST_BLOCK_OLD = `    setupFiles: ['test/setup.ts'],

    coverage: {
`

const TEST_BLOCK_NEW = `    setupFiles: ['test/setup.ts'],

    /**
     * Three times Vitest's 5 s default.
     *
     * A test's clock also runs while the machine does work that has nothing to
     * do with what the test asserts: the first dynamic \`import()\` in a file is
     * transformed inside the test that makes it, a component test mounts a tree
     * of Reka primitives in jsdom, and the script tests start a Node process.
     * Idle, each takes well under a second. Beside a build, an e2e run or a
     * second test run they crossed 5 s, a different handful of tests each time,
     * and none of those failures said anything about the code. A test that
     * hangs still fails; it takes ten seconds longer to say so.
     */
    testTimeout: 15_000,

    /**
     * Off CI, half the cores.
     *
     * Vitest starts one worker per core, each with its own jsdom, and gives a
     * worker a fixed time to come up. On a machine that is also running an
     * editor, a dev server and a browser, that many at once is what failed: a
     * worker timed out before it ran a test. Half leaves room for the rest of
     * what a developer runs. CI's runners do nothing else, so they keep the
     * default; \`--maxWorkers=<n>\` on the command line overrides either.
     */
    ...(process.env.CI ? {} : { maxWorkers: '50%' }),

    coverage: {
`

/**
 * The template's tests failed on a busy machine for reasons that were not in
 * the code: a 5 s limit, and a worker per core. A project runs the same tests
 * and more of its own, so an unedited test block gets the same two settings.
 *
 * No guard and no note. A project that has shaped its test block has made its
 * own choices here, and a setting it may not want is not worth a line in every
 * upgrade report; `apply` finds the shipped lines or changes nothing.
 *
 * "Has made its own choice" means the config sets one of the two options: a
 * key, in code. A comment that mentions `testTimeout` is not a choice.
 */
const setsTestRoom = (source) =>
  /(?:^|[\s,{])(['"]?)(?:testTimeout|maxWorkers)\1\s*:/m.test(withoutComments(source))

const testRoom = {
  file: 'vite.config.ts',
  apply: (source) =>
    setsTestRoom(source)
      ? source
      : replaceBlocks(source, [{ from: TEST_BLOCK_OLD, to: TEST_BLOCK_NEW }]),
}

// ─── vite.config.ts: .vuestrata/ is not source ───────────────────────────────

const LINT_IGNORE_OLD = `      'packages/cli/payload/**',
      '.agents/**',
`

const LINT_IGNORE_NEW = `      'packages/cli/payload/**',
      // What \`vuestrata upgrade\` leaves beside a file it would not overwrite:
      // the release's version, to compare and merge. Not part of the app, and
      // outside the alias roots like the payload, so type-checking it fails.
      '.vuestrata/**',
      '.agents/**',
`

const FMT_IGNORE_OLD = `    ignorePatterns: [
      '.agents/**',
      '*.d.ts',
`

const FMT_IGNORE_NEW = `    ignorePatterns: [
      '.agents/**',
      // A release's files as that release formatted them, kept to be compared.
      '.vuestrata/**',
      '*.d.ts',
`

/**
 * An upgrade that holds a file back writes the release's version to
 * .vuestrata/incoming/, and the type-aware linter then read it as source: a
 * TypeScript file outside the alias roots, where `@/bootstrap` resolves to
 * nothing. So the first upgrade that left a copy behind turned `vp check` and
 * `vpr lint` red until the copy was merged, which is the opposite of what the
 * copy is for.
 *
 * The linter's list is the one that matters. The formatter's is added where
 * its shipped lines are still there, and is not missed where they are not.
 *
 * Done when the config has the entry: a string that names the directory, in
 * code. A comment about `.vuestrata/` ignores nothing.
 */
const ignoresIncoming = (source) =>
  /(['"`])[^'"`\n]*\.vuestrata(?![\w-])[^'"`\n]*\1/.test(withoutComments(source))

const incomingIgnored = {
  file: 'vite.config.ts',
  pending: (source) => !ignoresIncoming(source),
  apply: (source) =>
    replaceBlocks(source, [
      { from: LINT_IGNORE_OLD, to: LINT_IGNORE_NEW },
      { from: FMT_IGNORE_OLD, to: FMT_IGNORE_NEW, optional: true },
    ]),
  note:
    "vite.config.ts: add `'.vuestrata/**'` to `lint.ignorePatterns` (and to " +
    '`fmt.ignorePatterns`). The list there is not the one 1.0.1-alpha.6 shipped, so it was left ' +
    'alone. Without that entry `vp check` and `vpr lint` type-check the copies an upgrade ' +
    'leaves in .vuestrata/incoming/, and those fail by design: they sit outside the alias ' +
    'roots, so their imports resolve to nothing.',
}

// ─── The three merged files ──────────────────────────────────────────────────

/**
 * The Ui* barrel, the forms barrel and the permission union are merged from
 * 1.1.0: hashed with their `app:` regions emptied. A lock written before that
 * records them as managed with a whole-file hash, which a project that has run
 * `add component` or `add module` no longer matches, so the upgrade would offer
 * it its own barrel as an edit.
 *
 * Each hash is what the file hashed to the merged way at 1.0.1-alpha.5 and
 * 1.0.1-alpha.6 (they agree), from
 *
 *     node packages/cli/scripts/pristine-hashes.mjs \
 *       --tags v1.0.1-alpha.5,v1.0.1-alpha.6 <path...>
 *
 * It describes the OLD file, which is the one a project has. An untouched
 * project needs no step: the sync accepts its whole-file hash once.
 */
const reclassified = [
  {
    slot: 'uiBarrel',
    pristine: ['sha256-ac125768526345230bdf91fd5cf112f92569055f1a6f97443c833c5be64836b1'],
  },
  {
    slot: 'formComposablesBarrel',
    pristine: ['sha256-79b0c9ff1cce42c08a14305ed0c7afa96a2df217f4cb3636be3c778bcdf60c29'],
  },
  {
    slot: 'permissions',
    pristine: ['sha256-9cea2c7654c28bf669b8c0ff69585c7f7c6f1651f73684dfc325c6500e6cc9ac'],
  },
].map((step) => ({ kind: 'reclassify', to: 'merged', ...step }))

// ─── The migration ───────────────────────────────────────────────────────────

export default [
  {
    description: 'the Ui* barrel, the forms barrel and the permission union become merged files',
    steps: reclassified,
  },
  {
    description: 'vpr lint no longer runs the template-lock check, a maintainer gate',
    steps: [lintWithoutLockCheck],
  },
  {
    description:
      'the router keeps the stale-chunk marker until a navigation the visitor made arrives',
    steps: [routerAfterEach],
  },
  {
    description: 'a stale chunk reloads the page only when the attempt can be recorded',
    steps: [staleChunkReload, staleChunkExport],
  },
  {
    description: 'the login page says when a session expired',
    steps: [loginExpiredNotice],
  },
  {
    description: 'pages that ship in a production bundle stop quoting the demo account and stores',
    steps: demoLiterals,
  },
  {
    description: 'tests that asserted the 1.0 behaviour of files this release replaces',
    steps: pinnedTests,
  },
  {
    // Three changes to one file, in one group: the report names a file once
    // per group, and three groups named this one three times.
    description:
      'vite.config.ts imports the Vuestrata env plugin, allows a test 15 s (and, off CI, half ' +
      'the cores), and keeps the linter and the formatter out of .vuestrata/',
    steps: [envPlugin, testRoom, incomingIgnored],
  },
]
