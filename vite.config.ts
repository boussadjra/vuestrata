import { fileURLToPath, URL } from 'node:url'

import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import tailwindcss from '@tailwindcss/vite'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import Layouts from 'vite-plugin-vue-layouts'
import { defineConfig } from 'vite-plus'
import VueRouter from 'vue-router/vite'

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
    ignorePatterns: [],
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

  envPrefix: 'VUESTRATA_',

  plugins: [
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

      include: [fileURLToPath(new URL('./src/modules/app/locales/**', import.meta.url))],
    }),
  ],

  build: {
    target: 'es2022',
    // 'hidden' generates sourcemaps for the error tracker but does NOT emit
    // the `//# sourceMappingURL=` comment, so production users can't see them.
    sourcemap: 'hidden',

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
