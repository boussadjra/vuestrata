import type { Plugin } from 'vite-plus'

/**
 * Validates the `VUESTRATA_*` environment — strictly, so an invalid
 * combination fails the build — and supplies `__VUESTRATA_DEMO__`,
 * `__VUESTRATA_AUTH_ADAPTERS__` and `build.sourcemap` from it. Under `vp dev`,
 * it proxies a same-origin API path to `DEV_API_TARGET` and lets the page
 * reach a cross-origin API.
 *
 * The implementation and its reasoning are in `vuestrata-plugin.mjs`.
 */
export declare function vuestrataEnv(): Plugin

/**
 * The auth adapters registered in the project's
 * `src/modules/app/config/auth.config.ts` under `root`, as
 * `{ name: transport }`. Empty when the file is not there.
 */
export declare function readAuthAdapters(root: string): Record<string, 'bearer' | 'cookie'>

/**
 * The same, from the source text of that file. It is parsed, never run; a
 * registration the parser cannot see through throws.
 */
export declare function scanAuthAdapters(source: string): Record<string, 'bearer' | 'cookie'>
