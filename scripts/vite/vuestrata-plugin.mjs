/**
 * Vuestrata's Vite plugin: where the validated runtime environment meets the
 * build and the dev server.
 *
 * It lives here rather than inline in `vite.config.ts` so that it can belong to
 * Vuestrata, which keeps improving it, while the config that calls it stays the
 * project's own. `vuestrata-plugin.d.mts` beside it keeps that config typed.
 */
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { loadEnv } from 'vite-plus'

// Relative import, not an alias: this file runs in Node before `resolve.alias`
// exists. `env.schema.ts` is dependency-free for exactly this reason.
// Explicit .ts extension: the config may be loaded as native ESM, which does
// not do extensionless resolution.
import { parseRuntimeEnv } from '../../src/modules/core/lib/config/env.schema.ts'

/**
 * Resolves and validates the runtime environment, then feeds the result into
 * `define` and `build.sourcemap`.
 *
 * This lives in a plugin rather than a `defineConfig(({ mode }) => …)` callback
 * because Vite+ reads the `lint`/`fmt`/`staged` fields off a STATIC default
 * export — a function export breaks `vp fmt` and `vp lint`. The `config` hook
 * gets us the resolved mode while keeping the export static.
 *
 * @returns {import('vite-plus').Plugin}
 */
export function vuestrataEnv() {
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
      // core/lib/config runs the same schema leniently.
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
          sourcemap: isDemoBuild ? 'hidden' : false,
        },
      }
    },
  }
}
