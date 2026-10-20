import { fileURLToPath, URL } from 'node:url'

import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import tailwindcss from '@tailwindcss/vite'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import Layouts from 'vite-plugin-vue-layouts'
import { defineConfig } from 'vite-plus'
import VueRouter from 'vue-router/vite'

// Vuestrata's own plugin: environment validation, the build-target defines,
// and the dev-server proxy to `DEV_API_TARGET`. It lives in its own file so
// that Vuestrata can own it while this config stays yours.
import { vuestrataEnv } from './scripts/vite/vuestrata-plugin.mjs'

export default defineConfig({
  lint: {
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'warn',
      'no-debugger': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',

      // A module's index.ts is its public API. Reaching past it couples callers
      // to internals the owning module never promised to keep. Relative paths
      // are untouched, so a module still reaches its own files freely — this
      // only ever fires on a cross-module import.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['~/modules/*/**', '@/modules/*/**'],
              message:
                'Import from the module barrel (~/modules/<name>), not a deep path. If the value you need is not exported there, add it to that module’s index.ts — deciding what is public is the point. See AGENTS.md.',
            },
          ],
        },
      ],
    },
    overrides: [
      {
        // Tests are the one legitimate consumer of module internals. A unit
        // test for `projects/board.ts` should import `board.ts` — requiring it
        // to go through the barrel would force every internal to be re-exported
        // purely to be testable, turning the public API into an index of every
        // file. That is the precise outcome the barrel rule exists to prevent
        // (see the note in src/modules/users/index.ts).
        files: ['test/**', 'e2e/**', 'src/**/__tests__/**', 'src/**/*.test.ts'],
        rules: {
          'no-restricted-imports': 'off',
        },
      },
      {
        // `core/lib` is the framework-agnostic layer: it is consumed by the app
        // but must never reach back into Vue. Anything Vue-shaped it needs is
        // injected through `core/lib/runtime.ts`. Type-only imports are allowed
        // — they erase at compile time and create no runtime coupling.
        files: ['src/modules/core/lib/**'],
        // The one deliberate exception. `collection-queries.ts` IS the Vue Query
        // factory — being Vue-coupled is its entire job. It sits here rather
        // than in the app layer so every domain module can share one
        // implementation of the collection contract.
        excludeFiles: ['src/modules/core/lib/api/collection-queries.ts'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              paths: [
                { name: 'vue', allowTypeImports: true },
                { name: 'vue-router', allowTypeImports: true },
                { name: 'vue-i18n', allowTypeImports: true },
                { name: 'pinia', allowTypeImports: true },
                { name: '@tanstack/vue-query', allowTypeImports: true },
              ],
            },
          ],
        },
      },
      {
        // The `Ui*` layer is the one part of this template a project is most
        // likely to keep taking updates for, and the one it is most likely to
        // have restyled. Both are only possible while a wrapper depends on
        // nothing that belongs to a particular application: the moment
        // `UiToast` imports this app's notification store, a project that
        // renames that store has to fork the component to keep it working, and
        // a forked component can never be updated again.
        //
        // Allowed: `core/lib`, `composables/forms`, `config/icon-provider`,
        // `~/types`, and Reka. Anything application-shaped is passed in as a
        // prop or reported as an emit.
        files: ['src/modules/app/components/ui/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  group: ['~/stores/*', '@/stores/*', '~/state/*', '@/state/*'],
                  message:
                    'A Ui* wrapper must not read application state. Take it as a prop, or emit and let the caller decide — see UiToast.vue. Otherwise the component cannot be updated independently of the app that uses it.',
                },
                {
                  group: ['~/modules/*', '@/modules/*', '~/modules/*/**', '@/modules/*/**'],
                  message:
                    'A Ui* wrapper must not depend on a feature module. The dependency runs the other way: modules compose the component surface.',
                },
              ],
            },
          ],
        },
      },
      {
        // Route pages are thin inbound adapters: they coordinate, they do not
        // implement. A page that imports the data layer directly has taken on
        // work that belongs in the module's composables. See AGENTS.md.
        files: ['src/modules/*/pages/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              paths: [
                {
                  name: '@tanstack/vue-query',
                  message:
                    'Route pages must not call the data layer directly. Put the query or mutation in the module’s composables/ and call that from the page. See AGENTS.md.',
                },
              ],
              patterns: [
                {
                  group: ['**/mocks/**'],
                  message:
                    'Route pages must not import mock handlers — mocks are wired through ModuleDefinition.mockHandlers, which is stripped from production builds.',
                },
              ],
            },
          ],
        },
      },
    ],
    ignorePatterns: [
      'dist/**',
      'node_modules/**',
      // A byte-for-byte copy of the files above, shipped inside the CLI so
      // `vuestrata upgrade` has something to install. Linting it would report
      // every finding twice, and type-checking it fails outright: the copies
      // sit outside the alias roots, so `@/types` resolves to nothing.
      'packages/cli/payload/**',
      // What `vuestrata upgrade` leaves beside a file it would not overwrite:
      // the release's version, to compare and merge. Not part of the app, and
      // outside the alias roots like the payload, so type-checking it fails.
      '.vuestrata/**',
      '.agents/**',
      '*.d.ts',
      'auto-imports.d.ts',
      'components.d.ts',
      'typed-router.d.ts',
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
    bracketSpacing: true,
    sortImports: true,
    sortTailwindcss: true,
    ignorePatterns: [
      '.agents/**',
      // A release's files as that release formatted them, kept to be compared.
      '.vuestrata/**',
      '*.d.ts',
      'auto-imports.d.ts',
      'components.d.ts',
      'typed-router.d.ts',
      // Vendored, regenerated by `vp exec msw init public --save`. Formatting
      // it would be undone by the next sync and make `check-worker-version`
      // diffs unreadable.
      'public/mockServiceWorker.js',
    ],
  },
  staged: {
    '*.{ts,vue}': ['vp lint --fix', 'vp fmt', 'node scripts/lint/run-custom-rules.mjs'],
  },
  resolve: {
    alias: {
      '@/lib': fileURLToPath(new URL('./src/modules/core/lib', import.meta.url)),
      '~/lib': fileURLToPath(new URL('./src/modules/core/lib', import.meta.url)),
      '@/modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
      '~/modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
      '@': fileURLToPath(new URL('./src/modules/app', import.meta.url)),
      '~': fileURLToPath(new URL('./src/modules/app', import.meta.url)),
    },
  },

  // Only VUESTRATA_ is exposed. `VITE_`-prefixed variables are deliberately
  // NOT re-enabled: adding it back would expose every unrelated VITE_* var,
  // and the two former VITE_VUESTRATA_* keys were silently always-undefined
  // because this prefix replaces (not extends) Vite's default.
  envPrefix: 'VUESTRATA_',

  plugins: [
    // Must run first: it validates the environment and supplies `define`.
    vuestrataEnv(),

    VueRouter({
      // Only these two folders are file-routed. Domain modules
      // (customers, orders, …) reach the router exclusively through
      // `ModuleDefinition.routes`, registered at runtime by `setupModules()`
      // in src/modules/index.ts — that is what applies the layout wrapper and
      // the RBAC meta. A `src/modules/*/pages` entry used to sit here; the
      // glob is never expanded, so it produced zero routes and only misled
      // readers into thinking domain pages were auto-routed.
      routesFolder: [
        { src: 'src/modules/app/pages' },
        // Auth pages live in their own module; mount them under /auth/*.
        { src: 'src/modules/auth/pages', path: 'auth/' },
      ],

      extensions: ['.vue'],
      exclude: ['**/_components/**'],

      dts: 'typed-router.d.ts',
    }),

    Vue(),

    tailwindcss(),

    // Layout system

    Layouts({
      layoutsDirs: 'src/modules/app/layouts',

      defaultLayout: 'default',
    }),

    // Auto-import Vue APIs

    AutoImport({
      imports: [
        'vue',

        'vue-router',

        'vue-i18n',

        '@vueuse/core',
      ],

      dts: 'src/auto-imports.d.ts',

      dirs: ['src/modules/app/composables/**'],

      dirsScanOptions: {
        // Only scan composable files (use*.ts); skip barrel index.ts files that
        // re-export the same names and would cause "Duplicated imports" warnings.
        filePatterns: ['use*.ts'],
        fileFilter: (file) => /[\\/]use[^\\/]*\.ts$/.test(file),
      },

      vueTemplate: true,
    }),

    // Auto-import components

    Components({
      dirs: ['src/modules/app/components'],

      dts: 'src/components.d.ts',

      deep: true,
    }),

    // i18n

    VueI18n({
      runtimeOnly: true,

      compositionOnly: true,

      fullInstall: true,

      include: [
        fileURLToPath(new URL('./src/modules/app/locales/**', import.meta.url)),
        fileURLToPath(new URL('./src/modules/**/i18n/**', import.meta.url)),
      ],
    }),
  ],

  build: {
    target: 'es2022',
    // `sourcemap` is set by the vuestrata:env plugin — it depends on the
    // resolved runtime mode.

    rolldownOptions: {
      treeshake: {
        // These shipped query entrypoints only construct schemas, query
        // keys and the collection API; they perform no I/O or registration.
        // The registry reads metadata from their barrels. Their API code must
        // load with the feature that consumes it, rather than with that read.
        // Keep the list explicit: a project's composable may have side effects.
        moduleSideEffects: (id) =>
          !/\/src\/modules\/(?:analytics\/composables\/useDashboardQueries|calendar\/composables\/useCalendar|catalog\/composables\/useCatalog|customers\/composables\/useCustomers|messages\/composables\/useMessages|orders\/composables\/useOrders|projects\/composables\/useProjects|reports\/composables\/useReports|team\/composables\/useTeam|users\/composables\/useUpdateRoleMutation)\.ts$/.test(
            id.replaceAll('\\', '/'),
          ),
      },
      output: {
        /**
         * Named vendor chunks, and the order in which they claim modules.
         *
         * A group takes the modules its `test` matches AND everything those
         * modules import. A module two groups reach goes to the group with the
         * higher `priority`, and that is what the numbers are for.
         *
         * This used to be a `manualChunks(id)` function, where every name has
         * the same priority. `charts-vendor` reached Vue first (vue-echarts
         * imports it) and kept the whole Vue runtime, so every chunk of the app
         * imported the charting engine and index.html preloaded all of it, 778 KB,
         * on the login page. Returning 'vue-vendor' for Vue did not prevent it.
         *
         * So what every page needs claims its dependencies first, and what a
         * page asks for with `import()` takes only what is left. Keep it so when
         * you add a group: a library loaded on demand gets the lowest priority,
         * and anything it shares with the rest of the app must be matched by a
         * group above it. `verify-bundle` fails a build in which index.html
         * loads a chunk of an on-demand group.
         */
        codeSplitting: {
          groups: [
            // ── On every page ──────────────────────────────────────────────
            // Core framework
            {
              name: 'vue-vendor',
              test: /node_modules[\\/](?:vue|@vue|vue-router|pinia|@vueuse)[\\/]/,
              priority: 30,
            },
            // Reka headless UI primitives
            {
              name: 'ui-vendor',
              test: /node_modules[\\/](?:reka-ui|@floating-ui)[\\/]/,
              priority: 20,
            },
            // Tables / forms / data
            {
              name: 'data-vendor',
              test: /node_modules[\\/](?:@tanstack[\\/]vue-query|@formwerk[\\/])/,
              priority: 20,
            },

            // ── On demand ──────────────────────────────────────────────────
            {
              name: 'tables-vendor',
              test: /node_modules[\\/]@vueye-table[\\/]/,
              priority: 10,
              includeDependenciesRecursively: false,
            },
            // Charting — large; fetched by the first chart a page renders.
            //
            // It takes the library's own modules and not what they import.
            // By default a group also takes its modules' dependencies, here
            // tslib, and one eager import of that package anywhere in the
            // app (many libraries import it) would put the whole engine back
            // on every page. Left out, it gets a small chunk of its own.
            // Check the build before copying this to another group: on
            // docs-vendor it produced a circular import between two chunks.
            {
              name: 'charts-vendor',
              test: /node_modules[\\/](?:echarts|vue-echarts|zrender)[\\/]/,
              priority: 10,
              includeDependenciesRecursively: false,
            },
            // Markdown rendering + syntax highlighting (docs surface only)
            {
              name: 'docs-vendor',
              test: /node_modules[\\/](?:comark|shiki|@shikijs[\\/])/,
              priority: 10,
            },
            // MSW — only loaded when VUESTRATA_USE_MOCKS is true; isolate so
            // production bundles can drop it cleanly.
            {
              name: 'msw-vendor',
              test: /node_modules[\\/]msw[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },

  // Vitest config

  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],

    environment: 'jsdom',

    globals: true,

    setupFiles: ['test/setup.ts'],

    /**
     * Three times Vitest's 5 s default.
     *
     * A test's clock also runs while the machine does work that has nothing to
     * do with what the test asserts: the first dynamic `import()` in a file is
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
     * default; `--maxWorkers=<n>` on the command line overrides either.
     */
    ...(process.env.CI ? {} : { maxWorkers: '50%' }),

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'clover', 'json'],

      /**
       * A ratchet, not a target.
       *
       * CI already collected coverage and uploaded it as an artifact, but
       * nothing ever read it — coverage could fall to zero and every job would
       * still be green. These floors sit a couple of points under the measured
       * baseline (statements 65.7, branches 52.7, functions 58.0, lines 66.9)
       * so ordinary churn does not trip them, while a change that deletes or
       * strands a meaningful body of tested code does.
       *
       * Raise them when the real numbers rise. Lowering one is a decision that
       * belongs in a commit message, which is the entire point of having them.
       */
      thresholds: {
        statements: 63,
        branches: 50,
        functions: 55,
        lines: 64,
      },
    },
  },
})
