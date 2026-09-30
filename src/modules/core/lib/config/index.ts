import { createScopedLogger } from '../logger'
import { resolveRuntimeEnv } from './env.schema'

export * from './env.schema'

const configLogger = createScopedLogger('app-config')

/**
 * The validated runtime environment, resolved once at module load.
 *
 * The SAME zod schema runs at build time inside the Vite plugin
 * (`scripts/vite/vuestrata-plugin.mjs`), where it is strict and fails the
 * build. Here it is lenient by design: a misconfiguration that somehow reaches
 * the browser degrades with a warning rather than throwing during module
 * evaluation, which used to blank the page.
 *
 * This lives in `core/lib` rather than the app layer so that framework-agnostic
 * consumers (notably the API client) can read it without core depending on app,
 * which would be a cycle — `app/config/app.config.ts` imports the core logger.
 */
export const runtimeEnv = resolveRuntimeEnv(import.meta.env, {
  isDev: import.meta.env.DEV,
  // Must match the plugin, or `vp dev` would accept a local backend URL at
  // startup and this would quietly "correct" it back to `/api` in the page. A
  // build has already rejected such a URL, so this relaxes nothing that ships.
  serving: import.meta.env.DEV,
  onWarn: (message) => configLogger.warn(message),
})
