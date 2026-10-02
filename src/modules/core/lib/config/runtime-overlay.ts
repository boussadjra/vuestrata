/**
 * Deploy-time configuration: the values one built artifact takes from the
 * environment it is started in.
 *
 * Everything in `import.meta.env` is inlined when the app is built, so without
 * this a build belongs to exactly one environment. The overlay is what lets the
 * same image be promoted from staging to production: `runtime-config.js`, a
 * classic script the page loads before the app bundle, assigns
 * `window.__VUESTRATA_RUNTIME__`, and the values in it win over the built-in
 * ones.
 *
 * It is a script rather than a fetched JSON file because `runtimeEnv` and the
 * API client's base URL are resolved while their modules are evaluated. The
 * values have to exist before the bundle runs, and a request could only finish
 * after it.
 *
 * Only an allow-list can be overridden. What decides the CONTENTS of the bundle
 * — the runtime mode, the auth adapter, whether MSW is in it — was settled at
 * build time, and a deploy-time value cannot bring back code that was compiled
 * out.
 */
import { ENV_KEYS } from './env.schema'

/** The global `runtime-config.js` assigns. */
export const RUNTIME_CONFIG_GLOBAL = '__VUESTRATA_RUNTIME__'

/**
 * The built-in keys a deployment may set when the app starts. A project adds
 * its own through `runtime` in `app/config/deploy.config.ts`.
 *
 * The container entrypoint writes exactly these (plus the project's) into
 * `runtime-config.js`: `docker/runtime/keys` is generated from this list.
 */
export const RUNTIME_OVERRIDABLE_KEYS = [
  ENV_KEYS.apiUrl,
  ENV_KEYS.title,
  ENV_KEYS.errorReportingDsn,
  ENV_KEYS.release,
  ENV_KEYS.sessionPersistence,
] as const

export type RuntimeOverridableKey = (typeof RUNTIME_OVERRIDABLE_KEYS)[number]

const BUILTIN_KEYS: ReadonlySet<string> = new Set(Object.values(ENV_KEYS))

/**
 * A placeholder nothing substituted. A static host that serves the file as a
 * template (`"${VUESTRATA_API_URL}"`) and sets no value for a key leaves the
 * placeholder in place; it means "not configured", never the literal text.
 */
const UNSUBSTITUTED_PLACEHOLDER = /\$\{[^}]*\}/

export interface RuntimeOverlayOptions {
  /** Keys the project declared runtime-overridable, on top of the built-in list. */
  extraKeys?: readonly string[]
  /**
   * Called for everything that was ignored for a reason worth knowing: a key
   * outside the allow-list, a value that is not a string. Omit it to read
   * silently.
   */
  onWarn?: (message: string) => void
}

/**
 * The usable entries of `scope.__VUESTRATA_RUNTIME__`, by key.
 *
 * Never throws and never returns a value it was not given as a string: the
 * result goes through the same lenient validation as the built-in values, so a
 * bad one costs a warning and a fallback rather than a blank page. An empty
 * string and an unsubstituted `${VAR}` placeholder are both "not set".
 */
export function readRuntimeOverlay(
  scope: unknown,
  options: RuntimeOverlayOptions = {},
): Record<string, string> {
  const { extraKeys = [], onWarn } = options
  const overlay: Record<string, string> = {}

  if (typeof scope !== 'object' || scope === null) return overlay
  const source: unknown = (scope as Record<string, unknown>)[RUNTIME_CONFIG_GLOBAL]
  if (source === undefined || source === null) return overlay

  if (typeof source !== 'object' || Array.isArray(source)) {
    onWarn?.(
      `Ignoring ${RUNTIME_CONFIG_GLOBAL}: expected an object of strings, received ` +
        `${Array.isArray(source) ? 'an array' : typeof source}.`,
    )
    return overlay
  }

  // A built-in key outside the list stays out whatever a project declares: the
  // build refuses such a declaration, and this does not rely on it having run.
  const allowed = new Set<string>([
    ...RUNTIME_OVERRIDABLE_KEYS,
    ...extraKeys.filter((key) => !BUILTIN_KEYS.has(key)),
  ])

  for (const [key, value] of Object.entries(source)) {
    if (!allowed.has(key)) {
      onWarn?.(
        BUILTIN_KEYS.has(key)
          ? `Ignoring ${key} from ${RUNTIME_CONFIG_GLOBAL}: it decides what is in the bundle, ` +
              'so it is fixed when the app is built and cannot change at runtime.'
          : `Ignoring ${key} from ${RUNTIME_CONFIG_GLOBAL}: it is not a runtime-overridable key. ` +
              'A project declares its own under `runtime` in deploy.config.ts.',
      )
      continue
    }

    if (typeof value !== 'string') {
      onWarn?.(
        `Ignoring ${key} from ${RUNTIME_CONFIG_GLOBAL}: expected a string, received ` +
          `${value === null ? 'null' : typeof value}.`,
      )
      continue
    }

    const trimmed = value.trim()
    if (trimmed === '' || UNSUBSTITUTED_PLACEHOLDER.test(trimmed)) continue
    overlay[key] = trimmed
  }

  return overlay
}
