import type { Plugin } from 'vite-plus'

import type { DeployConfig } from '../../src/modules/core/lib/config/deploy'

export interface VuestrataEnvOptions {
  /**
   * The project's deployment configuration, in place of reading
   * `src/modules/app/config/deploy.config.ts`. A project never needs it: the
   * plugin finds that file itself. It is here for tests.
   */
  deployConfig?: DeployConfig
  /**
   * The exports of `scripts/security/headers.mjs`, in place of importing that
   * file. For tests, like `deployConfig`.
   */
  headerGenerators?: Record<string, unknown>
}

/**
 * Validates the `VUESTRATA_*` environment — strictly, so an invalid
 * combination fails the build — and supplies `__VUESTRATA_DEMO__`,
 * `__VUESTRATA_AUTH_ADAPTERS__` and `build.sourcemap` from it. The variables
 * declares in `deploy.config.ts` are validated the same way.
 *
 * It also makes every page load `runtime-config.js` before the app, which is
 * how a deployment sets values when the app starts rather than when it is
 * built. Under `vp dev`, it proxies a same-origin API path to `DEV_API_TARGET`.
 *
 * The implementation and its reasoning are in `vuestrata-plugin.mjs`.
 */
export declare function vuestrataEnv(options?: VuestrataEnvOptions): Plugin

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

/** What the build reads from an `auth.config.ts`. */
export interface ScannedAuthConfig {
  /** The adapters it registers, by name, with the transport each declares. */
  adapters: Record<string, 'bearer' | 'cookie'>
  /** The adapter names it declares in `RegisteredAuthAdapterNames`. */
  declared: string[]
}

/** Both facts, from the project's file under `root`. Empty when it is not there. */
export declare function readAuthConfig(root: string): ScannedAuthConfig

/** Both facts, from the source text of that file. It is parsed, never run. */
export declare function scanAuthConfig(source: string): ScannedAuthConfig

/**
 * One warning per adapter that is registered and not declared, or declared and
 * not registered. Empty when the two agree.
 */
export declare function describeUndeclaredAdapters(
  adapters: Record<string, 'bearer' | 'cookie'>,
  declared: readonly string[],
): string[]
