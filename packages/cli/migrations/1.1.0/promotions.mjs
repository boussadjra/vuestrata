import { hashFor } from '../../src/lib/lockfile.mjs'
import { hashContents } from '../../src/lib/plan.mjs'
import { RBAC_WIRING_STEPS } from '../../src/lib/rbac-wiring.mjs'
import { deploymentHeldBack } from './deployment.mjs'
import {
  headersBeingReplaced,
  HEADERS_PRISTINE,
  HEADERS_SCRIPTS,
  REGENERATE_HEADERS,
} from './headers-unit.mjs'
import { eolOf } from './text.mjs'

/**
 * Files the project owned that Vuestrata maintains from 1.1.0, and the two
 * entry files that become thin shells over the new managed bootstrap.
 *
 * Nothing here changes what a file does. `promote` steps hand Vuestrata a file
 * the project has always had, when — and only when — it is byte-for-byte what a
 * release shipped; the sync that follows then brings it up to date. An edited
 * copy stays as it is, with this release's version left in .vuestrata/incoming/
 * and a note.
 *
 * Every `pristine` hash is what the file hashed to at 1.0.1-alpha.5 and
 * 1.0.1-alpha.6 (they are the same for all of these), printed by
 *
 *     node packages/cli/scripts/pristine-hashes.mjs \
 *       --tags v1.0.1-alpha.5,v1.0.1-alpha.6 --class managed <path...> --json
 *
 * so a mistake here can be checked against the tags, not against memory.
 *
 * The files that a release of this migration ADDS (the bootstrap directory,
 * AppRoot.vue, the Vite plugin) need no step: the project has none, and the
 * payload sync installs them as new.
 */

export const PRISTINE = {
  'src/modules/app/stores/auth.ts': [
    'sha256-30092cfe5184cc4889fa00741f7cc8508b7331e0a70d8d036c4a549b4a9c3adf',
  ],
  'src/modules/app/stores/api-runtime.ts': [
    'sha256-3051578bbf0fc36e105a828d5c106e4b5e2e7912076c2b2433584c7a6ed78689',
  ],
  'src/modules/app/state/runtime-backends.ts': [
    'sha256-71e610a29fe110860a119cafa9caeacd1bc57ea06612cdf69c4d6b57df722ec0',
  ],
  'src/modules/app/state/build-info.ts': [
    'sha256-f56fe89183e03c11eef803c01ec8ce71e5e269636b2399d2667f71e5168641f8',
  ],
  'src/modules/app/plugins/route-guard.ts': [
    'sha256-f193295439014c087115a55611e2b02d4f476a61606fb383b004339e32b8e311',
  ],
  'src/modules/app/plugins/session-restore.ts': [
    'sha256-4613308c94ee51d6fc95098e11a39a9c461b116ef81df8cf803f841e25f1df97',
  ],
  'src/modules/app/plugins/vue-query.ts': [
    'sha256-df5c5c2a729b3e8344a9d17613ba22efdc67072e3d78df4b3b81132afd92c9da',
  ],
  'src/modules/app/composables/useRbac.ts': [
    'sha256-9e95b180a713a0022a4769028b8ee1de16a97ab4fb765988c25c7ee4da4dac3f',
  ],
  'src/modules/auth/composables/useAuth.ts': [
    'sha256-912d6a8c51d203ffb65ea29c4cece88fc23da184396bdc88b3cdb154112d624c',
  ],
  'src/modules/app/mocks/collection.ts': [
    'sha256-4d8bbdff18070dbc633de5c257be4652c1a8e6d2906e299dbedff296874c4cef',
  ],
  'src/modules/app/mocks/utils.ts': [
    'sha256-c561839b83157d786926cbc8e7f61b99cd582b235ffe6bdae1930c51fc445372',
  ],
  'src/modules/app/mocks/seed.ts': [
    'sha256-0e569cbdc3a3543a26e89a95f75c9472ece192e5c541f32262178825802e3e86',
  ],
  'src/modules/app/types/forms.ts': [
    'sha256-85b25c7c7101ba3cb7f5ddb1e061d575a12ac6d0396be3ca005d3572f11ac5c1',
  ],
  'src/modules/app/types/button-group.ts': [
    'sha256-c7ca55b938648c3f4f252566ce1eea6d7c482f9e352509f088eff488be083067',
  ],
  'src/modules/app/locales/en.json': [
    'sha256-9397de125b3d545505976cf90b53178deb5a0df22a1ae08f55b67e4158d51b80',
  ],
  'src/modules/app/locales/fr.json': [
    'sha256-7e619bdc10491d87d041086dbba61e179f914c751d3328434cf56ae3ddb9a920',
  ],
  'src/modules/app/locales/ar.json': [
    'sha256-e2b602f14591cc0f3d74fc28713f0cca32d5d3485e899bc80b189ac52071ba4b',
  ],
  // The two header generators, which other steps ask about (headers-unit.mjs).
  ...HEADERS_PRISTINE,
  'scripts/build/verify-bundle.mjs': [
    'sha256-250e692b52c8bb6f98dd07402a1389daa15353c1d74be0e8b67e0b9934ef36c5',
  ],
  'scripts/build/write-version.mjs': [
    'sha256-f6572718e4021771ef388f8d607b82b81b2a8917b6724d0086fba2c5a6332336',
  ],
  'src/modules/auth/adapters/base.ts': [
    'sha256-aa2b7be151ea115628fcfb2cf7f8a1d4776e7094a6c44264d582db946b9559e5',
  ],
  'src/modules/auth/adapters/index.ts': [
    'sha256-cfb47e9183c09f2df523d293a3343ace94d05e6f472bce4c50409fc6a790c4ca',
  ],
  'src/modules/auth/adapters/jwt.ts': [
    'sha256-21623d4fd60a4ea22d9fba8c08f7b907ed9f96a209547aa107e0f34c32462f7a',
  ],
  'src/modules/auth/adapters/mock.ts': [
    'sha256-8c81d92716549f886ed05ea6171d1e2c2fac19076c408644c3086920a1347fb8',
  ],
  'src/modules/auth/adapters/oauth.ts': [
    'sha256-9090f5d684ca70b825bc73f0b9d7e005a0096fe2905c73a2cead1dc75fbb7d93',
  ],
  'src/modules/auth/adapters/pkce-state.ts': [
    'sha256-7fce70310a4db06a0ee88a56e03550798215f04c2de9addf18e207b20a0d3e03',
  ],
  'src/modules/auth/adapters/types.ts': [
    'sha256-1e8888d30b05ff08b5f57e20899067837020344a3305cf9217e3d892f4cd00ad',
  ],
  'src/modules/auth/lib/pkce.ts': [
    'sha256-d33606c8b80bb8086ae02ba4a8feae827fefc3758a15374d9cf9c1fc97c847bd',
  ],
}

/** The pristine entry files, at the same two releases. */
const PRISTINE_MAIN = ['sha256-6e8a1a00184753d63269ab80f0d06bf51f3ab167de1813d8cd627d883530e9c9']
const PRISTINE_APP = ['sha256-8a816842089999d60f1a8d1cbf7fe0ec1ec33dec9c94f5f29f209ad1d00ff2f1']

/** What the two headers scripts move as. Each is written against the other. */
const HEADERS_UNIT = 'security-headers'

/** The plumbing files, in the order a reader would look for them. */
const PLAIN_PROMOTIONS = Object.keys(PRISTINE).filter((rel) => !HEADERS_SCRIPTS.includes(rel))

const LOCALE = /^src\/modules\/app\/locales\/(en|fr|ar)\.json$/
const QUERY_PLUGIN = 'src/modules/app/plugins/vue-query.ts'
const RUNTIME_BACKENDS = 'src/modules/app/state/runtime-backends.ts'

function promoteNote(rel) {
  const locale = LOCALE.exec(rel)
  if (locale) {
    const overrides = `src/modules/app/locales/${locale[1]}.overrides.json`
    return (
      `${rel} is maintained by Vuestrata from 1.1.0, but this copy differs from every release ` +
      `that shipped it, so it was left alone. Put your own wording in ${overrides}, which ` +
      `upgrades never touch, and merge what you want from .vuestrata/incoming/${rel}. Then ` +
      `run \`vuestrata adopt ${rel}\` so later releases can update it.`
    )
  }

  if (rel === QUERY_PLUGIN) {
    return (
      `${rel} is maintained by Vuestrata from 1.1.0: it re-exports the query client options ` +
      `from src/modules/app/bootstrap/query-client.ts, which boot() reads. This copy differs ` +
      `from every release that shipped it, so it was left alone. A src/main.ts this upgrade ` +
      `replaced passes your \`vueQueryOptions\` to boot(), so they still apply; a main.ts you ` +
      `edited keeps reading this file as before. Check the retry settings in it either way: ` +
      `the API client no longer retries on its own, so the \`retry: 1\` that 1.0 shipped is now ` +
      `one retry for every failed query, a 404 included. Set \`retry: shouldRetryQuery\` and ` +
      `\`retryDelay: queryRetryDelay\` (from '~/lib/api/retry') on queries, and ` +
      `\`retry: false\` on mutations. To hand the file over, first move your options ` +
      `into a file of your own and pass them with \`boot(App, { queryOptions })\` (spread ` +
      `\`vueQueryOptions\` from '@/bootstrap/query-client' to keep the retry policy), then run ` +
      `\`vuestrata adopt ${rel}\` once this file matches .vuestrata/incoming/${rel}. Adopting it ` +
      `first would drop your options.`
    )
  }

  if (rel === RUNTIME_BACKENDS) {
    return (
      `${rel} is maintained by Vuestrata from 1.1.0, but this copy differs from every release ` +
      `that shipped it, so it was left alone. ${RBAC_WIRING_STEPS} Then run ` +
      `\`vuestrata adopt ${rel}\` so later releases can update it.`
    )
  }

  return undefined
}

// ─── vite.config.ts ──────────────────────────────────────────────────────────

/**
 * The env plugin as 1.0.1-alpha.6 shipped it inside vite.config.ts, from the
 * comment above its import to the closing brace of the function.
 *
 * Located by markers and compared by hash rather than kept as text here: it is
 * seventy lines, and nothing else in the file has to match. A project that
 * edited the plugin, or anything inside this span, has a different hash and is
 * left alone.
 */
const ENV_BLOCK_START = '// Relative import, not an alias'
const ENV_BLOCK_END = '\n}\n\nexport default defineConfig('
const ENV_BLOCK_HASH = 'sha256-65db801190909f3fd6281efba5859d35cd11ef200c67e3e19f6a81e21bb9054d'

const PLUGIN_IMPORT = [
  "// Vuestrata's own plugin: environment validation, the build-target defines,",
  '// and the dev-server proxy to `DEV_API_TARGET`. It lives in its own file so',
  '// that Vuestrata can own it while this config stays yours.',
  "import { vuestrataEnv } from './scripts/vite/vuestrata-plugin.mjs'",
].join('\n')

function findEnvBlock(text) {
  const start = text.indexOf(ENV_BLOCK_START)
  if (start === -1) return null
  const end = text.indexOf(ENV_BLOCK_END, start)
  if (end === -1) return null
  return { start, end: end + 2 }
}

/** The inline plugin is still there, whether or not it is exactly as shipped. */
const definesEnvPluginInline = (source) => /^function vuestrataEnv\(/m.test(source)

function useEnvPluginFile(source) {
  const eol = eolOf(source)
  const text = source.replaceAll('\r\n', '\n')

  const found = findEnvBlock(text)
  if (!found || hashContents(text.slice(found.start, found.end)) !== ENV_BLOCK_HASH) return source

  let next = text.slice(0, found.start) + PLUGIN_IMPORT + text.slice(found.end)

  // What only the plugin used. Removed when nothing left in the file names it,
  // and only in the exact form 1.0.1-alpha.6 shipped, so a project that reshaped
  // its imports keeps them (an unused import is a lint warning, not a break).
  const body = next.replace(/^import .*$/gm, '')
  const stillUses = (pattern) => pattern.test(body)
  const dropLine = (line, pattern) => {
    if (!stillUses(pattern)) next = next.replace(`${line}\n`, '')
  }
  dropLine("import { rm } from 'node:fs/promises'", /\brm\(/)
  dropLine("import { resolve } from 'node:path'", /\bresolve\(/)
  if (!stillUses(/\bloadEnv\b/) && !stillUses(/\bPlugin\b/)) {
    next = next.replace(
      "import { defineConfig, loadEnv, type Plugin } from 'vite-plus'",
      "import { defineConfig } from 'vite-plus'",
    )
  }

  return eol === '\n' ? next : next.replaceAll('\n', eol)
}

/**
 * The step itself. It runs with the other changes to vite.config.ts
 * (project-files.mjs), so that the report names the file once.
 */
export const envPlugin = {
  file: 'vite.config.ts',
  pending: definesEnvPluginInline,
  apply: useEnvPluginFile,
  note:
    'vite.config.ts still defines the Vuestrata env plugin inline, and not as 1.0.1-alpha.6 ' +
    'shipped it, so it was left alone. Vuestrata now maintains that plugin in ' +
    'scripts/vite/vuestrata-plugin.mjs, with the dev-server proxy to DEV_API_TARGET. To ' +
    'take it: delete the vuestrataEnv function and its imports (parseRuntimeEnv, ' +
    'loadEnv, Plugin, rm, resolve where nothing else uses them), add ' +
    "`import { vuestrataEnv } from './scripts/vite/vuestrata-plugin.mjs'`, and keep " +
    'the vuestrataEnv() call in plugins. Put changes you made to the plugin in your ' +
    'own plugin beside it.',
}

// ─── main.ts and App.vue ─────────────────────────────────────────────────────

/**
 * The new entry files. They are exactly src/main.ts and src/App.vue of this
 * repository, which test/unit/cli/promote.test.ts asserts, so the migration and
 * a fresh clone cannot drift apart.
 */
export const MAIN_SHELL = `// Yours. Everything that has to happen before the first paint (theme, error
// reporting, the router, the module registry, the auth session) is boot(),
// which Vuestrata maintains under src/modules/app/bootstrap/.
//
// To add something of your own, pass beforeMount:
//
//   void boot(App, { beforeMount: (app) => { app.use(MyPlugin) } })
//
// Copying the steps of boot() into this file stops it receiving fixes.
import { boot } from '@/bootstrap'

// Root component
import App from './App.vue'

// Local styles
import '@/styles/app.css'

void boot(App)
`

export const APP_SHELL = `<script setup lang="ts">
import AppRoot from '@/components/layout/AppRoot.vue'
</script>

<!--
  Yours. The root component is AppRoot, which Vuestrata maintains: theme and
  locale sync, the error boundary and the route outlet. Wrap it, or put
  something beside it (a global toast host, a cookie banner), rather than
  copying its contents here, since a copy stops receiving fixes.
-->
<template>
  <AppRoot />
</template>
`

/**
 * Replace an entry file with its shell, only when it is byte-for-byte a
 * release's copy. Anything else is the project's own work: the shell goes to
 * .vuestrata/incoming/ and a note says what to carry over.
 */
function shellCodemod({ file, shell, pristine, adopted, note }) {
  // A shell may depend on the rest of the project, so it can be a function of it.
  const shellFor = typeof shell === 'function' ? shell : () => shell

  return {
    file,
    // Done once the file uses the managed root — decided by what it calls, not
    // by an exact copy, so a later release changing the shell does not make
    // every project that took this one look unfinished.
    pending: (source) => !adopted.test(source),
    apply: (source, manifest, ws) =>
      pristine.includes(hashFor(file, source, 'managed'))
        ? shellFor(ws).replaceAll('\n', eolOf(source))
        : source,
    incoming: (source, manifest, ws) => shellFor(ws),
    note,
  }
}

/**
 * Whether the query client options in the project's `plugins/vue-query.ts` are
 * the ones `boot()` already uses: a release's copy, or the shim that replaced
 * it. Any other copy is the project's own tuning, which the old main.ts applied
 * and boot(App) alone would drop without a word.
 */
function usesDefaultQueryOptions(ws) {
  if (!ws?.exists(QUERY_PLUGIN)) return true
  const source = ws.read(QUERY_PLUGIN)
  return (
    PRISTINE[QUERY_PLUGIN].includes(hashFor(QUERY_PLUGIN, source, 'managed')) ||
    /from\s+['"]@\/bootstrap\/query-client['"]/.test(source)
  )
}

/**
 * `src/main.ts` for this project. Where the project tuned the query client, the
 * shell hands those options to boot() from the file that still holds them.
 *
 * Chosen over holding main.ts back. Both keep the options, but a main.ts left
 * behind keeps the whole old boot sequence with them, and stops receiving
 * fixes to it for the sake of one object. The import cannot dangle: this shell
 * only ever replaces a pristine main.ts, which imported `vueQueryOptions` from
 * this same path and passed it to the same plugin.
 */
export function mainShellFor(ws) {
  if (usesDefaultQueryOptions(ws)) return MAIN_SHELL

  return MAIN_SHELL.replace(
    "import { boot } from '@/bootstrap'\n",
    "import { boot } from '@/bootstrap'\n" +
      '// Your own query client options, which this file applied before the upgrade.\n' +
      '// They are still in the plugins/vue-query.ts you edited. Move them to a file\n' +
      '// of your own before you hand that one back to Vuestrata.\n' +
      "import { vueQueryOptions } from '@/plugins/vue-query'\n",
  ).replace('void boot(App)', 'void boot(App, { queryOptions: vueQueryOptions })')
}

const mainShell = shellCodemod({
  file: 'src/main.ts',
  shell: mainShellFor,
  pristine: PRISTINE_MAIN,
  adopted: /from\s+['"]@\/bootstrap['"]/,
  note:
    'src/main.ts was edited, so it was left as it is; it keeps working, but it still runs the ' +
    'old boot sequence and no longer receives fixes to it. The new one is in ' +
    '.vuestrata/incoming/src/main.ts: it only calls boot(App). To move over, put what you added ' +
    '(app.use(...), directives, providers) into boot(App, { beforeMount: (app) => { ... } }), ' +
    'and query client changes into boot(App, { queryOptions }), then replace this file.',
})

const appShell = shellCodemod({
  file: 'src/App.vue',
  shell: APP_SHELL,
  pristine: PRISTINE_APP,
  adopted: /<AppRoot\b/,
  note:
    'src/App.vue was edited, so it was left as it is; it keeps working, but the root component ' +
    'it holds no longer receives fixes. The new one is in .vuestrata/incoming/src/App.vue: it ' +
    'renders <AppRoot />, which Vuestrata maintains. Put what you added around it, or beside ' +
    'it, and replace this file.',
})

// ─── The migration ───────────────────────────────────────────────────────────

export default [
  {
    description: 'the plumbing files become Vuestrata-maintained (promoted in place)',
    steps: PLAIN_PROMOTIONS.map((file) => ({
      kind: 'promote',
      file,
      pristine: PRISTINE[file],
      note: promoteNote(file),
    })),
  },
  {
    description: 'the header generators are Vuestrata-maintained, and move as one unit',
    steps: [
      ...HEADERS_SCRIPTS.map((file, index) => ({
        kind: 'promote',
        file,
        unit: HEADERS_UNIT,
        pristine: PRISTINE[file],
        // One note for both: it rides on the first, and the second stays silent.
        note:
          index === 0
            ? 'scripts/security/headers.mjs and scripts/security/sync-headers.mjs are one unit: ' +
              'each imports what the other exports, so they are replaced together or not at all. ' +
              'At least one of yours differs from 1.0.1-alpha.6, so neither was replaced. Merge ' +
              'the copies in .vuestrata/incoming/scripts/security/ into yours (put your own ' +
              'policy in headers.mjs), run `vuestrata adopt` on both, then run ' +
              '`vpr security:headers`.'
            : undefined,
      })),
      {
        kind: 'note',
        file: HEADERS_SCRIPTS[0],
        // Notes run before the ownership steps, so while headers.mjs is still a
        // release's copy this upgrade is the one about to replace it. Once it has
        // been, the reminder is done and stays quiet on the next prerelease. It
        // holds only while BOTH scripts are a release's copy: if either was
        // edited the pair is held back, nothing is regenerated, and the note
        // above already says what to do.
        //
        // And only while the deployment files have nothing to say. When one of
        // them was left alone, its note ends on this reminder, so that one note
        // covers the image and what it is built from instead of two.
        pending: (source, manifest, ws) =>
          headersBeingReplaced(ws) && deploymentHeldBack(manifest, ws).length === 0,
        note:
          'scripts/security/headers.mjs and sync-headers.mjs were replaced (no incoming copy is ' +
          `listed for them above), so ${REGENERATE_HEADERS}`,
      },
    ],
  },
  {
    description: 'src/main.ts becomes boot(App) over the managed bootstrap',
    steps: [mainShell],
  },
  {
    description: 'src/App.vue becomes <AppRoot />',
    steps: [appShell],
  },
]
