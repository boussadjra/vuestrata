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
    },
    ignorePatterns: [
      'dist/**',
      'node_modules/**',
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
      routesFolder: [
        { src: 'src/modules/app/pages' },
        // Auth pages live in their own module; mount them under /auth/*.
        { src: 'src/modules/auth/pages', path: 'auth/' },
        {
          src: 'src/modules/*/pages',
        },
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
  },
})
