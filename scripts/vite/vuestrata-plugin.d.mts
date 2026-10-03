import type { Plugin } from 'vite-plus'

import type { DeployConfig } from '../../src/modules/core/lib/config/deploy'

export interface VuestrataEnvOptions {
  /**
   * The project's deployment configuration, in place of reading
   * `src/modules/app/config/deploy.config.ts`. A project never needs it: the
   * plugin finds that file itself. It is here for tests.
   */
  deployConfig?: DeployConfig
}

/**
 * Validates the `VUESTRATA_*` environment — strictly, so an invalid
 * combination fails the build — and supplies `__VUESTRATA_DEMO__` and
 * `build.sourcemap` from it. The variables and header sources a project
 * declares in `deploy.config.ts` are validated the same way.
 *
 * It also makes every page load `runtime-config.js` before the app, which is
 * how a deployment sets values when the app starts rather than when it is
 * built. Under `vp dev`, it proxies a same-origin API path to `DEV_API_TARGET`.
 *
 * The implementation and its reasoning are in `vuestrata-plugin.mjs`.
 */
export declare function vuestrataEnv(options?: VuestrataEnvOptions): Plugin
