import deployConfig from '~/config/deploy.config'
import { type AppEnv, resolveAppEnv } from '~/lib/config/deploy'
import { readRuntimeOverlay } from '~/lib/config/runtime-overlay'
import { createScopedLogger } from '~/lib/logger'

const logger = createScopedLogger('app-env')
const warn = (message: string): void => logger.warn(message)

/**
 * The project's own environment variables — the ones it declares under `env`
 * in `app/config/deploy.config.ts` — validated and typed from their schemas.
 *
 *   import { appEnv } from '~/bootstrap/app-env'
 *   appEnv.VUESTRATA_FEATURE_BILLING // 'on' | 'off'
 *
 * Resolved once, like `runtimeEnv`, from the same two sources: what the build
 * inlined, overlaid by what the deployment set at start for the keys listed
 * under `runtime`. The build validated the inlined values strictly; here a bad
 * one costs a warning and its default, never a blank page.
 *
 * This is also where the runtime overlay is reported on. `core/lib/config`
 * reads it first and silently, because it cannot know the project's keys; this
 * module can, so one warning per ignored entry comes from here.
 *
 * `deploy.config.ts` is imported statically on purpose: a deleted seam fails
 * the build instead of quietly dropping the project's variables.
 */
export const appEnv: AppEnv<typeof deployConfig> = resolveAppEnv(
  deployConfig,
  {
    ...import.meta.env,
    ...readRuntimeOverlay(globalThis, { extraKeys: deployConfig.runtime, onWarn: warn }),
  },
  { onWarn: warn },
)
