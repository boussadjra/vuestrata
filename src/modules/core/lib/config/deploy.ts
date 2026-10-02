/**
 * What a project declares about its own deployment, in
 * `app/config/deploy.config.ts`: environment variables of its own, which of
 * them a deployment may set at runtime, and what the security headers allow
 * beyond the defaults.
 *
 * Like `env.schema.ts`, this module has no value import at all — not even a
 * relative one. The Vite plugin loads it in Node before aliases exist, and the
 * seeded file that calls `defineDeployConfig` is read by the header generator
 * the same way. The schemas are the project's, so `zod` is only named as a
 * type here.
 *
 * Two entry points, as for the built-in variables:
 *   - `parseAppEnv`   — strict. Throws. The build runs it.
 *   - `resolveAppEnv` — lenient. Warns and falls back. The browser runs it.
 */
import type { z } from 'zod'

/** One declared variable. It is handed the raw string, or `undefined` when unset. */
export type AppEnvShape = Record<string, z.ZodType>

/** `Cross-Origin-Opener-Policy` values a deployment may choose. */
export type CrossOriginOpenerPolicy = 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none'

/**
 * What the security headers allow on top of the defaults in
 * `scripts/security/headers.mjs`. Every list ADDS sources; none can remove one.
 *
 * A source is an origin — `scheme://host[:port]`, with an optional `*.`
 * wildcard — never a URL with a path. The generator refuses anything else,
 * because one invalid source makes a browser discard the whole directive.
 */
export interface DeployHeaders {
  /** Origins the app may connect to (`fetch`, XHR, WebSocket, EventSource). */
  connectSrc?: readonly string[]
  /**
   * Environment variables whose value is a URL the app connects to. The origin
   * of each is added to `connect-src` when the headers are rendered for an
   * environment: at container start, or by `sync-headers.mjs --from-env`.
   */
  connectSrcFromEnv?: readonly string[]
  /**
   * As `connectSrcFromEnv`, for the WebSocket twin of an http(s) URL:
   * `https://x.example` also allows `wss://x.example`.
   */
  websocketFromEnv?: readonly string[]
  /** Image origins, or the scheme sources `https:`, `data:` and `blob:`. */
  imgSrc?: readonly string[]
  /** Origins the app may embed in a frame. Without any, only its own. */
  frameSrc?: readonly string[]
  /** Font origins, or the scheme source `data:`. */
  fontSrc?: readonly string[]
  /**
   * Defaults to `same-origin`, which cuts `window.opener` across origins.
   * Popup sign-in (MSAL `loginPopup`, Firebase `signInWithPopup`, Google
   * Identity Services) needs `same-origin-allow-popups`.
   */
  crossOriginOpenerPolicy?: CrossOriginOpenerPolicy
  /**
   * Who may embed the app in a frame: `'self'` or origins. Defaults to
   * `'none'`.
   */
  frameAncestors?: readonly string[]
}

export interface DeployConfig<Env extends AppEnvShape = AppEnvShape> {
  /**
   * The project's own variables, each with the schema that validates it. Names
   * start with `VUESTRATA_`: no other prefix reaches the browser.
   */
  env?: Env
  /**
   * Which of them a deployment may set when the app starts, as it can the
   * built-in runtime-overridable keys. Give each a default or make it optional:
   * nothing guarantees that an environment sets it.
   */
  runtime?: readonly (keyof Env & string)[]
  headers?: DeployHeaders
}

/** The validated values of a config's `env`, keyed by variable name. */
export type AppEnv<Config> =
  Config extends DeployConfig<infer Env>
    ? { readonly [Key in keyof Env]: z.output<Env[Key]> }
    : never

/**
 * Declare the project's deployment configuration.
 *
 * An identity function: it exists so `app/config/deploy.config.ts` is
 * type-checked against `DeployConfig`, and so `appEnv` is typed from the
 * schemas written there. A release can add optional fields without breaking a
 * copy written against the old shape.
 */
export function defineDeployConfig<const Env extends AppEnvShape = Record<never, never>>(
  config: DeployConfig<Env>,
): DeployConfig<Env> {
  return config
}

/** A name Vite exposes to the browser and a POSIX shell accepts as a variable. */
const APP_ENV_KEY = /^VUESTRATA_[A-Z0-9_]+$/

/** The two fields whose shape is checked, whatever the schemas are. */
interface DeclaredEnv {
  env?: Record<string, unknown>
  runtime?: readonly string[]
}

/**
 * What is wrong with the config's own shape, as messages. Empty when it is
 * fine. `reservedKeys` are the built-in variable names, which the caller owns
 * a list of.
 */
export function describeDeployConfigIssues(
  config: DeclaredEnv,
  reservedKeys: readonly string[] = [],
): string[] {
  const issues: string[] = []
  const declared = Object.keys(config.env ?? {})

  for (const key of declared) {
    if (!APP_ENV_KEY.test(key)) {
      issues.push(
        `env.${key}: a variable name must be VUESTRATA_ followed by capitals, digits and ` +
          'underscores. No other prefix is exposed to the browser.',
      )
    } else if (reservedKeys.includes(key)) {
      issues.push(`env.${key}: this is a built-in variable; it cannot be declared again.`)
    }
  }

  for (const key of config.runtime ?? []) {
    if (!declared.includes(key)) {
      issues.push(`runtime: "${key}" is not declared under env.`)
    }
  }

  return issues
}

/** Same reading of a raw value as the built-in schema: `''` is "not set". */
function optional(value: unknown): string | undefined {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ')
}

interface ParseAppEnvOptions {
  /** The built-in variable names, so a declaration cannot shadow one. */
  reservedKeys?: readonly string[]
}

/**
 * Strict parse. Throws one error listing every problem.
 *
 * A variable listed under `runtime` may be absent here even when its schema
 * requires it: the build cannot know what a container will be started with.
 * A value that IS present is validated like any other.
 */
export function parseAppEnv<Env extends AppEnvShape>(
  config: DeployConfig<Env>,
  raw: Record<string, unknown>,
  options: ParseAppEnvOptions = {},
): AppEnv<DeployConfig<Env>> {
  const issues = describeDeployConfigIssues(config, options.reservedKeys)
  const values: Record<string, unknown> = {}
  const runtime: readonly string[] = config.runtime ?? []

  for (const [key, schema] of Object.entries(config.env ?? {})) {
    const value = optional(raw[key])
    const parsed = schema.safeParse(value)
    if (parsed.success) {
      values[key] = parsed.data
    } else if (value !== undefined || !runtime.includes(key)) {
      issues.push(`${key}: ${describeIssues(parsed.error)}`)
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `[vuestrata:env] Invalid app environment (deploy.config.ts):\n  - ${issues.join('\n  - ')}`,
    )
  }

  return values as AppEnv<DeployConfig<Env>>
}

interface ResolveAppEnvOptions {
  onWarn?: (message: string) => void
}

/**
 * Lenient parse. Never throws: an invalid value falls back to what its schema
 * makes of "not set" — its default, or `undefined` — with a warning.
 *
 * In a correctly built artifact this only matters for values that arrive at
 * runtime; the build has already validated the rest with `parseAppEnv`.
 */
export function resolveAppEnv<Env extends AppEnvShape>(
  config: DeployConfig<Env>,
  raw: Record<string, unknown>,
  options: ResolveAppEnvOptions = {},
): AppEnv<DeployConfig<Env>> {
  const warn = options.onWarn ?? (() => {})
  const values: Record<string, unknown> = {}

  for (const [key, schema] of Object.entries(config.env ?? {})) {
    const value = optional(raw[key])
    const parsed = schema.safeParse(value)
    if (parsed.success) {
      values[key] = parsed.data
      continue
    }

    if (value === undefined) {
      warn(`${key} is not set: ${describeIssues(parsed.error)}. It is undefined in appEnv.`)
      values[key] = undefined
      continue
    }

    const fallback = schema.safeParse(undefined)
    warn(
      `Ignoring invalid ${key}: ${describeIssues(parsed.error)}. ` +
        (fallback.success ? 'Falling back to the default.' : 'It is undefined in appEnv.'),
    )
    values[key] = fallback.success ? fallback.data : undefined
  }

  return values as AppEnv<DeployConfig<Env>>
}
