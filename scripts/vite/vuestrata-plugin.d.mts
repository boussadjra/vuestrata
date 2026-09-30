import type { Plugin } from 'vite-plus'

/**
 * Validates the `VUESTRATA_*` environment — strictly, so an invalid
 * combination fails the build — and supplies `__VUESTRATA_DEMO__` and
 * `build.sourcemap` from it. Under `vp dev`, it proxies a same-origin API path
 * to `DEV_API_TARGET` and lets the page reach a cross-origin API.
 *
 * The implementation and its reasoning are in `vuestrata-plugin.mjs`.
 */
export declare function vuestrataEnv(): Plugin
