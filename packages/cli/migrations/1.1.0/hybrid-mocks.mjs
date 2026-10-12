import { inSlot } from '../../src/lib/manifest.mjs'
import { declaresBinding, replaceBlocks, withoutComments } from './text.mjs'

/**
 * What `VUESTRATA_MOCK_ONLY` needs from two files the project owns.
 *
 * 1.1.0 lets a demo build mock only some modules while a real backend, signed
 * in to through a real adapter, answers for the rest. Nothing changes for a
 * project that does not set the variable, and neither step here changes what an
 * ordinary demo or a production build does. They make the two files correct for
 * a build that does set it:
 *
 *   - the login page showed the demo account whenever MSW was compiled in. In
 *     that build MSW is compiled in and the demo account does not exist;
 *   - the static mock handlers were one flat list, so none of them could be
 *     selected by module.
 *
 * Both replace text only where it is exactly what 1.0.1-alpha.5 and
 * 1.0.1-alpha.6 shipped (the two agree), as every step in project-files.mjs
 * does.
 */

const inApp = (rel) => (manifest) => inSlot(manifest, 'appDir', rel)
const inModules = (rel) => (manifest) => inSlot(manifest, 'modulesDir', rel)

// ─── auth/pages/login.vue ────────────────────────────────────────────────────

const HINT_IMPORT_OLD = `import { resolveIcon } from '~/config/icon-provider'
`

const HINT_IMPORT_NEW = `import { resolveIcon } from '~/config/icon-provider'
import { runtimeEnv } from '~/lib/config'
`

const HINT_OLD = `const demoAccount = __VUESTRATA_DEMO__ ? DEMO_ACCOUNT : null
`

const HINT_NEW = `const demoAccount = __VUESTRATA_DEMO__ && runtimeEnv.authAdapter === 'mock' ? DEMO_ACCOUNT : null
`

/** The comment above the line, as shipped, with what the new condition adds. */
const HINT_DOC_OLD = ` * the address does not appear in the bundle at all.
 */
${HINT_OLD}`

const HINT_DOC_NEW = ` * the address does not appear in the bundle at all.
 *
 * And only where the mock adapter signs in. A demo build can also mock a few
 * modules beside a real backend (\`VUESTRATA_MOCK_ONLY\`), with a real adapter:
 * the demo account does not exist there, and the hint would be a lie.
 */
${HINT_NEW}`

/**
 * The page still decides the hint by the build constant alone: `DEMO_ACCOUNT`
 * chosen by `__VUESTRATA_DEMO__ ? …`, in code, with nothing else in the
 * condition. A page that dropped the hint, or already asks about the adapter,
 * is done.
 */
const showsDemoAccountInEveryDemoBuild = (source) =>
  /__VUESTRATA_DEMO__\s*\?\s*DEMO_ACCOUNT\b/.test(withoutComments(source))

const loginDemoHint = {
  file: inModules('auth/pages/login.vue'),
  pending: showsDemoAccountInEveryDemoBuild,
  apply: (source) => {
    // The new condition reads `runtimeEnv`, imported from `~/lib/config`, which
    // is Vuestrata's and so is there in every project. A page that has the
    // name already, for anything, would get it twice.
    if (declaresBinding(source, 'runtimeEnv')) return source

    const imported = { from: HINT_IMPORT_OLD, to: HINT_IMPORT_NEW }
    const documented = replaceBlocks(source, [imported, { from: HINT_DOC_OLD, to: HINT_DOC_NEW }])
    // A page that reworded the comment still gets the line.
    return documented === source
      ? replaceBlocks(source, [imported, { from: HINT_OLD, to: HINT_NEW }])
      : documented
  },
  note:
    'src/modules/auth/pages/login.vue is yours, and the lines that show the demo account are ' +
    'not the ones 1.0.1-alpha.6 shipped, so it was left alone. It shows the demo credentials ' +
    'in every demo build (`__VUESTRATA_DEMO__ ? DEMO_ACCOUNT : null`). That is still right for ' +
    'the self-contained demo. A demo build that sets VUESTRATA_MOCK_ONLY, new in 1.1.0, signs ' +
    'in against your real backend, where that account does not exist: show the hint only with ' +
    "the mock adapter. `import { runtimeEnv } from '~/lib/config'` and make the condition " +
    "`__VUESTRATA_DEMO__ && runtimeEnv.authAdapter === 'mock' ? DEMO_ACCOUNT : null`. Nothing " +
    'to do if you never set VUESTRATA_MOCK_ONLY.',
}

// ─── app/mocks/handlers/index.ts ─────────────────────────────────────────────

const HANDLERS_OLD = `export const handlers = [
  ...dashboardHandlers,
  ...usersHandlers,
  ...billingHandlers,
  ...auditHandlers,
]
`

const HANDLER_SETS = `
/**
 * The same handlers, by the id of the module whose endpoints they answer.
 *
 * \`VUESTRATA_MOCK_ONLY\` lists module ids, and MSW then answers for those
 * modules alone while a real backend answers for the rest. The handlers a
 * module contributes through \`mockHandlers\` are found by that module's id.
 * These are not contributed by a module, so this is where each set says whose
 * it is: a set that is not listed here is never started in that mode.
 *
 * An ordinary demo does not read this. It starts every handler in \`handlers\`.
 */
export const handlerSets = {
  analytics: [...dashboardHandlers, ...auditHandlers],
  billing: billingHandlers,
  users: usersHandlers,
}
`

/**
 * The static handlers, by module id.
 *
 * No guard and no note. A project that never sets the variable needs nothing
 * here, and one that does is told by the app itself, at start, in the console,
 * naming this file and the export to add (`app/bootstrap/mocks.ts`): a line in
 * every upgrade report for a feature most projects will not turn on is not
 * worth it. `apply` finds the shipped list or changes nothing, and a file that
 * already has the name is left as it is.
 */
const staticHandlerSets = {
  file: inApp('mocks/handlers/index.ts'),
  apply: (source) =>
    declaresBinding(source, 'handlerSets')
      ? source
      : replaceBlocks(source, [{ from: HANDLERS_OLD, to: HANDLERS_OLD + HANDLER_SETS }]),
}

// ─── The migration ───────────────────────────────────────────────────────────

export default [
  {
    description:
      'the login page shows the demo account only where the mock adapter signs in, and the ' +
      'static mock handlers say which module each belongs to (for VUESTRATA_MOCK_ONLY)',
    steps: [loginDemoHint, staticHandlerSets],
  },
]
