import { createScopedLogger } from '../logger'
import { readRuntimeOverlay, resolveRuntimeEnvWithOverlay } from './runtime-overlay'

export * from './env.schema'
export * from './runtime-overlay'
export * from './deploy'

const configLogger = createScopedLogger('app-config')

/**
 * The validated runtime environment, resolved once at module load.
 *
 * Two sources, in this order of precedence:
 *   1. `window.__VUESTRATA_RUNTIME__` — what the deployment set when the app
 *      started, for the keys in `RUNTIME_OVERRIDABLE_KEYS` only (see
 *      `runtime-overlay.ts`).
 *   2. `import.meta.env` — what was inlined when the app was built.
 *
 * An overlaid value that is invalid on its own is dropped, with a warning
 * naming the key, and the built value applies. The rest is merged BEFORE the
 * combination rules run, so an overlaid value is held to the same rules as a
 * built-in one and every consumer — the API client's base URL,
 * `app.config.ts` — reads the result without knowing where it came from.
 *
 * The SAME zod schema runs at build time inside the Vite plugin
 * (`scripts/vite/vuestrata-plugin.mjs`), where it is strict and fails the
 * build. Here it is lenient by design: a misconfiguration that somehow reaches
 * the browser degrades with a warning rather than throwing during module
 * evaluation, which used to blank the page.
 *
 * What the overlay ignored for being outside the allow-list is reported once,
 * by `app/bootstrap/app-env.ts`, which also knows the keys the project
 * declared; here it is read without a warning sink.
 *
 * This lives in `core/lib` rather than the app layer so that framework-agnostic
 * consumers (notably the API client) can read it without core depending on app,
 * which would be a cycle — `app/config/app.config.ts` imports the core logger.
 */
export const runtimeEnv = resolveRuntimeEnvWithOverlay(
  import.meta.env,
  readRuntimeOverlay(globalThis),
  {
    isDev: import.meta.env.DEV,
    // Must match the plugin, or `vp dev` would accept a local backend URL at
    // startup and this would quietly "correct" it back to `/api` in the page. A
    // build has already rejected such a URL, so this relaxes nothing that ships.
    // An API URL set at start is accepted on a placeholder host as well: see
    // `resolveRuntimeEnvWithOverlay`.
    serving: import.meta.env.DEV,
    onWarn: (message) => configLogger.warn(message),
  },
)
