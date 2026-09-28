import type { Plugin } from 'vite-plus'

/**
 * Validates the `VUESTRATA_*` environment — strictly, so an invalid
 * combination fails the build — and supplies `__VUESTRATA_DEMO__` and
 * `build.sourcemap` from it.
 *
 * The implementation and its reasoning are in `vuestrata-plugin.mjs`.
 */
export declare function vuestrataEnv(): Plugin
