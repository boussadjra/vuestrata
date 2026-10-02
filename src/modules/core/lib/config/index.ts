import { createScopedLogger } from '../logger'
import { resolveRuntimeEnv, type RegisteredAuthAdapters } from './env.schema'

export * from './env.schema'

const configLogger = createScopedLogger('app-config')

/**
 * Build-time constant injected by the `vuestrata:env` plugin: the adapters the
 * project registered in `app/config/auth.config.ts`, by name, with the
 * transport each declares. The plugin reads them from that file as text, and
 * validates `VUESTRATA_AUTH_ADAPTER` against them before anything is bundled.
 *
 * Declared here rather than in `src/env.d.ts` because that file is the
 * project's: an upgrade cannot add a declaration to it, and this module has to
 * type-check in a project that has not touched it.
 */
declare const __VUESTRATA_AUTH_ADAPTERS__: RegisteredAuthAdapters | undefined

/**
 * The same registrations the build validated against, so the browser accepts
 * the names the build accepted. `core/lib` cannot import the app's config
 * file, and `runtimeEnv` is resolved before any seam is installed, which is
 * why they arrive as a constant. Absent — a Vite config without the plugin —
 * only the built-in adapters are known.
 */
const registeredAuthAdapters: RegisteredAuthAdapters =
  typeof __VUESTRATA_AUTH_ADAPTERS__ === 'undefined' ? {} : (__VUESTRATA_AUTH_ADAPTERS__ ?? {})

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
  authAdapters: registeredAuthAdapters,
  onWarn: (message) => configLogger.warn(message),
})
