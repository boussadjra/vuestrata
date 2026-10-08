import { inSlot } from '../../src/lib/manifest.mjs'
import { declaresBinding, replaceBlocks, withoutComments } from './text.mjs'

/**
 * What `VUESTRATA_BASE_PATH` needs from files the project owns.
 *
 * 1.1.0 can serve the app under a path prefix (`/console/`). The build, the
 * redirect URIs, the deploy check and the generated server configuration are
 * Vuestrata's and follow the variable by themselves. Five project files had
 * the root of the origin written into them, and these steps take it out.
 *
 * Nothing changes for a project that serves its app at `/`: each new line
 * means, there, exactly what the line it replaces meant. A project that keeps
 * its own version of one of these files therefore keeps working as it did, and
 * needs the change only on the day it sets the variable. The notes say so.
 *
 * Every step replaces text only where it is exactly what 1.0.1-alpha.5 and
 * 1.0.1-alpha.6 shipped (the two agree), as every step in project-files.mjs
 * does, and the steps that add an import first ask whether the file has the
 * name already.
 */

const inApp = (rel) => (manifest) => inSlot(manifest, 'appDir', rel)

const ONLY_UNDER_A_PREFIX =
  'Nothing to do if you serve the app at the root of its origin and never set VUESTRATA_BASE_PATH.'

// ─── plugins/router.ts ───────────────────────────────────────────────────────

const HISTORY_OLD = `  history: createWebHistory(),
`

const HISTORY_NEW = `  // Vite's \`base\`, which the build sets from VUESTRATA_BASE_PATH: \`/\`, or the
  // prefix the app is mounted under (\`/console/\`). Route paths stay as written;
  // the history adds and removes the prefix.
  history: createWebHistory(import.meta.env.BASE_URL),
`

/** The history is still created with no base: `createWebHistory()`, in code. */
const historyHasNoBase = (source) => /\bcreateWebHistory\(\s*\)/.test(withoutComments(source))

/**
 * The router's history takes the base path.
 *
 * Exported for project-files.mjs, which holds the other step for this file:
 * the upgrade report names a file once per group.
 */
export const routerBase = {
  file: inApp('plugins/router.ts'),
  pending: historyHasNoBase,
  apply: (source) => replaceBlocks(source, [{ from: HISTORY_OLD, to: HISTORY_NEW }]),
  note:
    'plugins/router.ts is yours, and it creates the history with `createWebHistory()` on a ' +
    'line that is not the one 1.0.1-alpha.6 shipped, so it was left alone. To serve the app ' +
    'under a path prefix (VUESTRATA_BASE_PATH, new in 1.1.0) the history needs the base: ' +
    'write `createWebHistory(import.meta.env.BASE_URL)`. Without it the app loads under the ' +
    `prefix and then matches no route. ${ONLY_UNDER_A_PREFIX}`,
}

// ─── The address bar, read before the router exists ──────────────────────────

/** `stores/app` is imported by two of the three files; the helper goes after it. */
const STORE_IMPORT = `import { useAppStore } from '@/stores/app'
`
const CONFIG_IMPORT = `import { appPathname } from '~/lib/config'
`

const THEME_IMPORT_OLD = `import { applyAppearance, readPersistedAppearance, resolveActiveLocale } from './appearance'
`
const THEME_IMPORT_NEW = `${CONFIG_IMPORT}
${THEME_IMPORT_OLD}`

const THEME_READ_OLD = `  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname
`
const THEME_READ_NEW = `  // The path inside the app: under a base path the address bar says
  // \`/console/docs/…\`, and \`/docs\` is what the docs are called.
  const pathname = appPathname()
`

const reader = (name) => ({
  old: `function ${name}(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname
}
`,
  new: `/** The path inside the app, without the base path it may be served under. */
function ${name}(): string {
  return appPathname()
}
`,
})

const I18N_READER = reader('readPathname')
const LOCALE_READER = reader('readWindowPathname')

/** The file still reads the address bar as it is, prefix included. */
const readsRawPathname = (source) => /\bwindow\.location\.pathname\b/.test(withoutComments(source))

/**
 * One of the three files that decide, before the router exists, whether the
 * page is a docs page (English, left to right). Under a prefix the address bar
 * holds `/console/docs/…`, which is not `/docs/…`.
 *
 * `appPathname` comes from `~/lib/config`, which is Vuestrata's and so is
 * there in every project. A file that already has the name, for anything,
 * would get it twice, and is left alone.
 */
const pathnameReader = (rel, blocks) => ({
  file: inApp(rel),
  pending: readsRawPathname,
  apply: (source) =>
    declaresBinding(source, 'appPathname') ? source : replaceBlocks(source, blocks),
  note:
    `${rel} is yours, and the line that reads \`window.location.pathname\` is not the one ` +
    '1.0.1-alpha.6 shipped, so it was left alone. Under a path prefix (VUESTRATA_BASE_PATH, ' +
    'new in 1.1.0) that value starts with the prefix, so a docs page is not recognised as one ' +
    'until the router has started, and its first paint follows the stored language instead of ' +
    "English. `import { appPathname } from '~/lib/config'` and call `appPathname()` where the " +
    `file reads \`window.location.pathname\`. ${ONLY_UNDER_A_PREFIX}`,
})

const pathnameReaders = [
  pathnameReader('plugins/bootstrap-theme.ts', [
    { from: THEME_IMPORT_OLD, to: THEME_IMPORT_NEW },
    { from: THEME_READ_OLD, to: THEME_READ_NEW },
  ]),
  pathnameReader('plugins/i18n.ts', [
    { from: STORE_IMPORT, to: STORE_IMPORT + CONFIG_IMPORT },
    { from: I18N_READER.old, to: I18N_READER.new },
  ]),
  pathnameReader('composables/useActiveLocale.ts', [
    { from: STORE_IMPORT, to: STORE_IMPORT + CONFIG_IMPORT },
    { from: LOCALE_READER.old, to: LOCALE_READER.new },
  ]),
]

// ─── public/site.webmanifest ─────────────────────────────────────────────────

const MANIFEST_OLD = `  "start_url": "/",
  "scope": "/",
`
const MANIFEST_NEW = `  "start_url": ".",
  "scope": ".",
`
const MANIFEST_ICON_OLD = `      "src": "/favicon.svg",
`
const MANIFEST_ICON_NEW = `      "src": "favicon.svg",
`

/** `start_url` or `scope` is still the root of the origin. */
function manifestNamesTheRoot(source) {
  try {
    const manifest = JSON.parse(source)
    return manifest.start_url === '/' || manifest.scope === '/'
  } catch {
    return false // not JSON this step can reason about
  }
}

/**
 * The manifest names its start URL, scope and icon relative to itself, so they
 * are under whatever prefix the manifest is served from. At the root `.` is
 * `/`, as before.
 */
const relativeManifest = {
  file: 'public/site.webmanifest',
  pending: manifestNamesTheRoot,
  apply: (source) =>
    replaceBlocks(source, [
      { from: MANIFEST_OLD, to: MANIFEST_NEW },
      { from: MANIFEST_ICON_OLD, to: MANIFEST_ICON_NEW, optional: true },
    ]),
  note:
    'public/site.webmanifest is yours, and its `start_url` and `scope` lines are not the ones ' +
    '1.0.1-alpha.6 shipped, so it was left alone. They name the root of the origin ("/"). ' +
    'Under a path prefix (VUESTRATA_BASE_PATH, new in 1.1.0) an installed app would open, and ' +
    'claim, the site above yours: write them relative to the manifest, `"start_url": "."` and ' +
    '`"scope": "."`, and the icon as `"src": "favicon.svg"`. ' +
    ONLY_UNDER_A_PREFIX,
}

// ─── The migration ───────────────────────────────────────────────────────────

export default [
  {
    description:
      'the first paint recognises a docs page under a base path, and the web app manifest ' +
      'names its start URL and scope relative to itself (for VUESTRATA_BASE_PATH)',
    steps: [...pathnameReaders, relativeManifest],
  },
]
