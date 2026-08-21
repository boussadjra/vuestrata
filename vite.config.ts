import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import tailwindcss from '@tailwindcss/vite'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import Layouts from 'vite-plugin-vue-layouts'
import { defineConfig, loadEnv, type Plugin } from 'vite-plus'
import VueRouter from 'vue-router/vite'

// Relative import, not an alias: this file runs in Node before `resolve.alias`
// exists. `env.schema.ts` is dependency-free for exactly this reason.
// Explicit .ts extension: the config is loaded as native ESM, which does not
// do extensionless resolution.
import { parseRuntimeEnv } from './src/modules/core/lib/config/env.schema.ts'

/**
 * Resolves and validates the runtime environment, then feeds the result into
 * `define` and `build.sourcemap`.
 *
 * This lives in a plugin rather than a `defineConfig(({ mode }) => …)` callback
 * because Vite+ reads the `lint`/`fmt`/`staged` fields off a STATIC default
 * export — a function export breaks `vp fmt` and `vp lint`. The `config` hook
 * gets us the resolved mode while keeping the export static.
 */
function vuestrataEnv(): Plugin {
  let isDemoBuild = true
  let outDir = 'dist'

  return {
    name: 'vuestrata:env',

    configResolved(resolved) {
      outDir = resolved.build.outDir
    },

    /**
     * `public/mockServiceWorker.js` is a static asset, so Vite copies it into
     * dist for BOTH targets. In a production build that publishes a service
     * worker able to intercept every request in the app — dead weight at best,
     * and a confusing artifact for anyone auditing the deployment. Nothing
     * registers it there (the registration code is compiled out), so remove it.
     *
     * This runs in `closeBundle` rather than `generateBundle` because public-dir
     * files are copied straight to disk and never enter the rollup bundle.
     */
    async closeBundle() {
      if (isDemoBuild) return
      await rm(resolve(process.cwd(), outDir, 'mockServiceWorker.js'), { force: true })
    },

    config(_config, { mode, command }) {
      const isDev = command === 'serve' || mode !== 'production'

      // Strict parse: an invalid or self-contradictory configuration fails the
      // BUILD here rather than reaching a browser. The app-side counterpart in
      // app.config.ts runs the same schema leniently.
      const env = parseRuntimeEnv(loadEnv(mode, process.cwd(), 'VUESTRATA_'), { isDev })
      isDemoBuild = env.runtimeMode === 'demo'

      return {
        define: {
          // Compile-time switch that lets rolldown dead-code-eliminate every
          // demo path (MSW, seeded IndexedDB users, demo credentials) out of a
          // production bundle. `appConfig` cannot do this — it is a runtime
          // value. Forced on under test so demo-state suites keep working.
          __VUESTRATA_DEMO__: JSON.stringify(mode === 'test' ? true : isDemoBuild),
        },
        build: {
          // 'hidden' emits .map files without the `//# sourceMappingURL=`
          // comment — useful for uploading to an error tracker, but the files
          // still ship and are fetchable by guessing the name. Emit them only
          // for the demo build; a real production deploy uploads them
          // out-of-band (see Dockerfile, which strips any that are generated).
          sourcemap: isDemoBuild ? ('hidden' as const) : false,
        },
      }
    },
  }
}

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
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // Core framework
          if (
            id.includes('node_modules/vue/') ||
            id.includes('node_modules/vue-router/') ||
            id.includes('node_modules/pinia/') ||
            id.includes('node_modules/@vueuse/')
          ) {
            return 'vue-vendor'
          }
          // Reka headless UI primitives
          if (id.includes('node_modules/reka-ui/') || id.includes('node_modules/@floating-ui/')) {
            return 'ui-vendor'
          }
          // Charting — large; almost never needed on the first paint.
          if (id.includes('node_modules/echarts/') || id.includes('node_modules/vue-echarts/')) {
            return 'charts-vendor'
          }
          // Markdown rendering + syntax highlighting (docs surface only)
          if (
            id.includes('node_modules/comark') ||
            id.includes('node_modules/shiki') ||
            id.includes('node_modules/@shikijs/')
          ) {
            return 'docs-vendor'
          }
          // Tables / forms / data
          if (
            id.includes('node_modules/@tanstack/vue-table') ||
            id.includes('node_modules/@tanstack/vue-query') ||
            id.includes('node_modules/@formwerk/')
          ) {
            return 'data-vendor'
          }
          // MSW — only loaded when VUESTRATA_USE_MOCKS is true; isolate so
          // production bundles can drop it cleanly.
          if (id.includes('node_modules/msw/')) {
            return 'msw-vendor'
          }
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
