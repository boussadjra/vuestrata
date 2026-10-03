/**
 * Centralized, runtime-validated environment configuration.
 *
 * This module is deliberately dependency-free apart from `zod`: it imports no
 * Vue, no logger, and — critically — no path aliases. That is what allows it to
 * be imported from BOTH the Vite plugin in `scripts/vite/vuestrata-plugin.mjs`
 * (which runs in Node before aliases exist) and from application code via
 * `app.config.ts`.
 *
 * Two entry points, two failure modes:
 *   - `parseRuntimeEnv`   — strict. Throws. Used at build time so a misconfigured
 *                           deployment fails `vp build` in CI.
 *   - `resolveRuntimeEnv` — lenient. Warns and auto-corrects. Used in the browser
 *                           so a config mistake can never white-screen a user.
 *
 * Both share one rule table (`applyCombinationRules`), so the two paths can
 * never disagree about what a valid configuration is.
 */
import { z } from 'zod'

// ─── Allowlists ───────────────────────────────────────────────────────────────

/**
 * The build target. This is the single switch that decides which of the two
 * artifacts we are producing, and it is resolved at BUILD time — see the
 * `__VUESTRATA_DEMO__` define in scripts/vite/vuestrata-plugin.mjs.
 *
 *   demo       — public showcase. MSW intercepts everything; mock auth only.
 *   production — real deployment. No MSW, no demo state, real auth adapter.
 */
export const RUNTIME_MODES = ['production', 'demo'] as const
/**
 * The auth adapters Vuestrata ships. `VUESTRATA_AUTH_ADAPTER` also accepts
 * any name a project registers under `adapters` in
 * `src/modules/app/config/auth.config.ts`; see `ResolveOptions.authAdapters`.
 */
export const AUTH_ADAPTERS = ['mock', 'jwt', 'oauth', 'session'] as const

/** How an auth adapter proves identity. Mirrors `AuthTransport` in the auth module. */
export type AuthAdapterTransport = 'bearer' | 'cookie'

/**
 * The project's own adapters, by name, with the transport each one declares.
 * Passed in rather than imported: this module has no dependencies, and the
 * file that registers them belongs to the app.
 */
export type RegisteredAuthAdapters = Readonly<Record<string, AuthAdapterTransport>>

/** Where a project registers an adapter. Named in the message for an unknown one. */
const AUTH_CONFIG_FILE = 'src/modules/app/config/auth.config.ts'

/**
 * The transport of the built-in adapters. `oauth` is a cookie session by design,
 * and `session` is one by definition: the backend's own session cookie.
 */
const BUILTIN_TRANSPORTS: Record<BuiltinAuthAdapterName, AuthAdapterTransport> = {
  mock: 'bearer',
  jwt: 'bearer',
  oauth: 'cookie',
  session: 'cookie',
}

/**
 * How a bearer-transport session survives a page reload.
 *
 * Tokens are held in memory, so without one of these a refresh (F5, a restored
 * tab, following a deep link) ends the session. That was the behaviour before
 * this setting existed, and it was silent — the app simply bounced the user to
 * the login page with no indication that anything was misconfigured.
 *
 * Only meaningful for the `bearer` transport. Cookie-transport adapters resume
 * from their HttpOnly session cookie unconditionally; the browser owns that
 * credential and there is nothing for this setting to control.
 *
 *   none           — no reload survival. Correct for kiosk/shared terminals
 *                    and for the demo, where IndexedDB already holds the
 *                    session. An explicit choice, not an accident.
 *   refresh-cookie — at boot the app calls the refresh endpoint with
 *                    `credentials: 'include'` and no body; the backend reads
 *                    its own HttpOnly refresh cookie and returns a new access
 *                    token. RECOMMENDED: no long-lived credential is ever
 *                    readable by JavaScript, so an XSS cannot exfiltrate it.
 *                    Requires backend support.
 *   session         — the refresh token is kept in `sessionStorage`. Survives
 *                    reload, dies with the tab. Readable by any script on the
 *                    origin: an XSS can steal it.
 *   local           — the refresh token is kept in `localStorage`. Survives a
 *                    browser restart. Same XSS exposure as `session`, over a
 *                    longer window and shared across tabs.
 *
 * `session` and `local` match the endpoint contract this template documents
 * (`POST /auth/login` returns `refreshToken` in the body). `refresh-cookie`
 * needs a backend that sets the cookie itself. Pick deliberately.
 */
export const SESSION_PERSISTENCE_MODES = ['none', 'refresh-cookie', 'session', 'local'] as const
export const ICON_PROVIDERS = [
  'solar',
  'lucide',
  'phosphor',
  'iconoir',
  'tabler',
  'mingcute',
  'remix',
  'griddy',
  'iconamoon',
] as const

export type RuntimeMode = (typeof RUNTIME_MODES)[number]
/** The adapters Vuestrata ships, as a closed union. */
export type BuiltinAuthAdapterName = (typeof AUTH_ADAPTERS)[number]

/**
 * The names of the adapters a project registers itself.
 *
 * Empty here, filled by declaration merging from `app/config/auth.config.ts`,
 * beside the `adapters` it registers:
 *
 *     declare module '~/lib/auth' {
 *       interface RegisteredAuthAdapterNames {
 *         acme: true
 *       }
 *     }
 *
 * The keys are what matter; the value type is not read. An interface rather
 * than a wider `string` because the type of the configured adapter is a
 * contract: a project that registers nothing must see exactly the union it
 * always saw, so nothing it wrote against `'mock' | 'jwt' | 'oauth'` stops
 * compiling when it takes a release. A project that registers `acme` widens
 * the type itself, with the one declaration above.
 *
 * It lives in this file, which imports nothing, because `AuthAdapterName` is
 * defined here; `~/lib/auth` re-exports it, and that is the name to augment.
 */
// oxlint-disable-next-line typescript/no-empty-object-type -- extended by declaration merging
export interface RegisteredAuthAdapterNames {}

/**
 * Every name `VUESTRATA_AUTH_ADAPTER` can hold: the built-in adapters, plus
 * whatever the project declared in `RegisteredAuthAdapterNames`.
 */
export type AuthAdapterName =
  | BuiltinAuthAdapterName
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- `never` until a project augments it
  | Extract<keyof RegisteredAuthAdapterNames, string>
export type SessionPersistence = (typeof SESSION_PERSISTENCE_MODES)[number]
export type IconProviderName = (typeof ICON_PROVIDERS)[number]

/** Canonical env keys. Referenced by docs, tests, and error messages. */
export const ENV_KEYS = {
  runtimeMode: 'VUESTRATA_RUNTIME_MODE',
  title: 'VUESTRATA_APP_TITLE',
  apiUrl: 'VUESTRATA_API_URL',
  useMocks: 'VUESTRATA_USE_MOCKS',
  authAdapter: 'VUESTRATA_AUTH_ADAPTER',
  sessionPersistence: 'VUESTRATA_SESSION_PERSISTENCE',
  iconProvider: 'VUESTRATA_ICON_PROVIDER',
  theme: 'VUESTRATA_THEME',
  demoRetentionHours: 'VUESTRATA_DEMO_AUTH_RETENTION_HOURS',
  errorReportingDsn: 'VUESTRATA_ERROR_REPORTING_DSN',
  release: 'VUESTRATA_RELEASE',
} as const

/** Kept for source compatibility with existing imports and tests. */
export const AUTH_ADAPTER_ENV_KEY = ENV_KEYS.authAdapter

/**
 * `VUESTRATA_API_URL` values that are obviously scaffolding rather than a real
 * backend. Allowed in demo mode and by the dev server (see
 * `ResolveOptions.serving`), rejected in a production build.
 */
const PLACEHOLDER_API_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', 'api.example.com'])

const DEFAULT_RETENTION_HOURS = 24
const MIN_RETENTION_HOURS = 1
const MAX_RETENTION_HOURS = 24 * 30

// ─── Raw env shape ────────────────────────────────────────────────────────────

/**
 * Everything arrives as a string (or undefined). `import.meta.env` also carries
 * `DEV`/`PROD` booleans and `loadEnv()` does not, so callers pass `isDev`
 * explicitly rather than having this module guess.
 */
export type RawEnv = Record<string, unknown>

/**
 * Env values are always strings in practice. Anything else (an object leaked in
 * from a hand-built test fixture) is treated as absent rather than coerced to
 * "[object Object]", which would then fail validation with a confusing message.
 *
 * `''` is what an unset-but-declared key looks like; treat it as absent too.
 */
function optional(value: unknown): string | undefined {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const booleanish = z
  .string()
  .transform((value, ctx) => {
    const normalized = value.toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
    ctx.addIssue({ code: 'custom', message: `expected "true" or "false", received ${value}` })
    return z.NEVER
  })
  .optional()

const retentionHours = z
  .string()
  .transform((value, ctx) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: 'custom', message: `expected a number, received ${value}` })
      return z.NEVER
    }
    const floored = Math.floor(parsed)
    if (floored < MIN_RETENTION_HOURS || floored > MAX_RETENTION_HOURS) {
      ctx.addIssue({
        code: 'custom',
        message: `expected ${MIN_RETENTION_HOURS}–${MAX_RETENTION_HOURS} hours, received ${floored}`,
      })
      return z.NEVER
    }
    return floored
  })
  .optional()

/**
 * An adapter name: a built-in one, or one the project registered.
 *
 * An unknown name is an error that says where adapters are registered. It is
 * never replaced by `mock`: that adapter's endpoints exist only inside the
 * demo's service worker, so a production app that fell back to it would fail
 * every sign-in with nothing to say why.
 */
function authAdapterName(registered: RegisteredAuthAdapters) {
  return z
    .string()
    .refine(
      (name) =>
        (AUTH_ADAPTERS as readonly string[]).includes(name) || Object.hasOwn(registered, name),
      {
        error: (issue) =>
          `unknown auth adapter "${String(issue.input)}". Built in: ${AUTH_ADAPTERS.join(', ')}. ` +
          `To use your own, register it under \`adapters\` in ${AUTH_CONFIG_FILE}.`,
      },
    )
    .optional()
}

/**
 * Per-field validation only. Cross-field rules live in `applyCombinationRules`
 * because they need the resolved defaults, which depend on `runtimeMode`.
 */
function createEnvSchema(registered: RegisteredAuthAdapters) {
  return z.object({
    [ENV_KEYS.runtimeMode]: z.enum(RUNTIME_MODES).optional(),
    [ENV_KEYS.title]: z.string().min(1).optional(),
    [ENV_KEYS.apiUrl]: z.string().min(1).optional(),
    [ENV_KEYS.useMocks]: booleanish,
    [ENV_KEYS.authAdapter]: authAdapterName(registered),
    [ENV_KEYS.sessionPersistence]: z.enum(SESSION_PERSISTENCE_MODES).optional(),
    [ENV_KEYS.iconProvider]: z.enum(ICON_PROVIDERS).optional(),
    [ENV_KEYS.theme]: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'must be lowercase alphanumeric with dashes')
      .optional(),
    [ENV_KEYS.demoRetentionHours]: retentionHours,
    // A DSN is a public ingest endpoint, not a secret — it is designed to be
    // embedded in client bundles. Auth tokens for the provider's API are a
    // different thing entirely and must never appear in a VUESTRATA_ variable.
    [ENV_KEYS.errorReportingDsn]: z.url('must be a valid DSN URL').optional(),
    [ENV_KEYS.release]: z.string().min(1).optional(),
  })
}

type ParsedEnv = z.infer<ReturnType<typeof createEnvSchema>>

// ─── Resolved shape ───────────────────────────────────────────────────────────

export interface RuntimeEnv {
  runtimeMode: RuntimeMode
  title: string
  apiUrl: string
  useMocks: boolean
  /**
   * A built-in adapter, or one the project registered in `auth.config.ts` and
   * declared in `RegisteredAuthAdapterNames`. With nothing declared this is
   * the built-in union, exactly as it was before a project could register any.
   */
  authAdapter: AuthAdapterName
  /**
   * Reload-survival strategy for bearer sessions. Ignored by cookie-transport
   * adapters, which resume from their session cookie regardless.
   */
  sessionPersistence: SessionPersistence
  iconProvider: IconProviderName
  theme: string
  demoAuth: { retentionHours: number }
  errorReporting: {
    /** Undefined means "report nowhere" — the correct state for the demo. */
    dsn: string | undefined
    /** Version string sent with reports, normally the git SHA. */
    release: string | undefined
  }
}

/** True when this configuration ships demo code (MSW, seeded IndexedDB users). */
export function isDemoRuntime(env: Pick<RuntimeEnv, 'runtimeMode'>): boolean {
  return env.runtimeMode === 'demo'
}

// ─── Combination rules ────────────────────────────────────────────────────────

type Correction = {
  message: string
  apply: (draft: RuntimeEnv) => void
  /** Set by the placeholder-host rule, for `describeDevProxyAlternative`. */
  placeholderApiUrl?: URL
}

/**
 * The cross-field rules that were entirely missing before: nothing stopped a
 * build from claiming `authAdapter=mock` with `useMocks=false`, which produces
 * an app whose auth endpoints simply do not exist.
 *
 * Each rule carries a correction so the lenient path can recover instead of
 * throwing. The strict path ignores the corrections and reports the messages.
 */
function collectCombinationIssues(
  env: RuntimeEnv,
  serving: boolean,
  registered: RegisteredAuthAdapters,
): Correction[] {
  const issues: Correction[] = []

  if (env.runtimeMode === 'demo') {
    if (!env.useMocks) {
      issues.push({
        message: `${ENV_KEYS.useMocks} must be "true" when ${ENV_KEYS.runtimeMode}="demo" — the demo has no backend to talk to.`,
        apply: (draft) => {
          draft.useMocks = true
        },
      })
    }
    if (env.authAdapter !== 'mock') {
      issues.push({
        message: `${ENV_KEYS.authAdapter} must be "mock" when ${ENV_KEYS.runtimeMode}="demo" (received "${env.authAdapter}").`,
        apply: (draft) => {
          draft.authAdapter = 'mock'
        },
      })
    }
    if (env.sessionPersistence !== 'none') {
      issues.push({
        message:
          `${ENV_KEYS.sessionPersistence} must be "none" when ${ENV_KEYS.runtimeMode}="demo" ` +
          `(received "${env.sessionPersistence}"). The demo restores its session from IndexedDB; ` +
          `there is no refresh token and no refresh endpoint outside MSW.`,
        apply: (draft) => {
          draft.sessionPersistence = 'none'
        },
      })
    }
    return issues
  }

  // runtimeMode === 'production'
  if (env.useMocks) {
    issues.push({
      message: `${ENV_KEYS.useMocks} must be "false" when ${ENV_KEYS.runtimeMode}="production" — MSW is not bundled in a production build.`,
      apply: (draft) => {
        draft.useMocks = false
      },
    })
  }

  if (env.authAdapter === 'mock') {
    issues.push({
      message:
        `${ENV_KEYS.authAdapter}="mock" is not valid in production: the mock adapter's endpoints only exist inside MSW. ` +
        `Use "jwt", "oauth" or "session", or set ${ENV_KEYS.runtimeMode}="demo".`,
      apply: (draft) => {
        draft.authAdapter = 'jwt'
      },
    })
  }

  // Cookie transport owns its own persistence: the browser holds an HttpOnly
  // session cookie and the app resumes from it unconditionally. Configuring a
  // bearer strategy alongside it is a contradiction, and silently honouring it
  // would mean writing a refresh token to Web Storage for an adapter that
  // never receives one. The rule follows the transport, so it holds for an
  // adapter the project registered as `cookie` exactly as it does for `oauth`.
  const transport = Object.hasOwn(BUILTIN_TRANSPORTS, env.authAdapter)
    ? BUILTIN_TRANSPORTS[env.authAdapter as BuiltinAuthAdapterName]
    : registered[env.authAdapter]
  if (transport === 'cookie' && env.sessionPersistence !== 'none') {
    issues.push({
      message:
        `${ENV_KEYS.sessionPersistence}="${env.sessionPersistence}" has no meaning with ` +
        `${ENV_KEYS.authAdapter}="${env.authAdapter}": that adapter uses cookie transport and resumes from ` +
        `its session cookie. Set it to "none".`,
      apply: (draft) => {
        draft.sessionPersistence = 'none'
      },
    })
  }

  const apiUrlIssue = describeApiUrlIssue(env.apiUrl, serving)
  if (apiUrlIssue) {
    issues.push({
      message: `${ENV_KEYS.apiUrl} is not usable in production: ${apiUrlIssue.message}`,
      placeholderApiUrl: apiUrlIssue.placeholder,
      apply: (draft) => {
        draft.apiUrl = '/api'
      },
    })
  }

  return issues
}

/**
 * A human-readable problem with the URL, or null when it is fine. `placeholder`
 * is set when the only problem is the host, which the dev server accepts.
 */
function describeApiUrlIssue(
  apiUrl: string,
  serving: boolean,
): { message: string; placeholder?: URL } | null {
  // A second leading slash is not a deeper path: `//host/path` is
  // protocol-relative, and a browser reads `/\host/path` the same way. Either
  // one sends the app's requests, and its credentials, to another host.
  if (/^\/[/\\]/.test(apiUrl)) {
    return {
      message:
        `"${apiUrl}" names another host: a browser reads a second leading "/" or "\\" as the ` +
        `start of one. Write an absolute URL, or a same-origin path with a single leading "/".`,
    }
  }

  // A same-origin path is legitimate — it means "behind a reverse proxy".
  if (apiUrl.startsWith('/')) return null

  let parsed: URL
  try {
    parsed = new URL(apiUrl)
  } catch {
    return {
      message: `"${apiUrl}" is neither an absolute URL nor a same-origin path starting with "/".`,
    }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { message: `"${apiUrl}" must use http or https.` }
  }
  if (!serving && PLACEHOLDER_API_HOSTS.has(parsed.hostname)) {
    return {
      message: `"${apiUrl}" points at the placeholder host "${parsed.hostname}".`,
      placeholder: parsed,
    }
  }
  return null
}

/**
 * How to develop against a backend the build has just refused: its URL split
 * into a same-origin path for the app and an origin for the dev proxy. The
 * proxy forwards the path unchanged, so the backend receives the requests it
 * would have before. A URL with no path gets `/api`, because the proxy cannot
 * take over the site root.
 *
 * Only the strict parser — which runs in Node, in the Vite plugin — calls this,
 * so the advice and the dev-only variable it names stay out of the browser
 * bundle, where the lenient parser could do nothing with either.
 */
function describeDevProxyAlternative(apiUrl: URL): string {
  const path = apiUrl.pathname.replace(/\/+$/, '')
  // A backend served from its root cannot sit behind /api: the proxy forwards
  // the path unchanged, so it would receive /api/users instead of /users.
  if (!path) {
    return (
      'A build must point at the real API. For development, `vp dev` accepts this ' +
      'URL while serving, provided the backend answers CORS; if the API lives under a ' +
      `path, keep it same-origin instead with ${ENV_KEYS.apiUrl}=/<path> and ` +
      `DEV_API_TARGET=${apiUrl.origin}.`
    )
  }
  return (
    'A build must point at the real API. For development, keep the API same-origin ' +
    `instead: ${ENV_KEYS.apiUrl}=${path} with DEV_API_TARGET=${apiUrl.origin} in ` +
    `.env.development.local, and \`vp dev\` proxies ${path} there.`
  )
}

/**
 * What is wrong with ONE value taken on its own, or null when it is fine.
 *
 * The rules a value can break without reference to any other: its field's
 * schema and, for the API URL, its form. A placeholder host is not among them.
 * That rule is about a BUILD that forgot to set the URL, and whoever calls
 * this is asking about a value somebody set on purpose (see
 * `resolveRuntimeEnvWithOverlay`).
 */
export function describeEnvValueIssue(
  key: string,
  value: string,
  // Only the adapter name depends on what a project registered, and that key
  // is decided at build: a caller checking a start-time value has none to pass.
  authAdapters: RegisteredAuthAdapters = {},
): string | null {
  const envSchema = createEnvSchema(authAdapters)
  const field = (envSchema.shape as Record<string, z.ZodType | undefined>)[key]
  if (!field) return null

  const parsed = field.safeParse(value)
  if (!parsed.success) return parsed.error.issues.map((issue) => issue.message).join('; ')

  return key === ENV_KEYS.apiUrl ? (describeApiUrlIssue(value, true)?.message ?? null) : null
}

// ─── Resolution ───────────────────────────────────────────────────────────────

export interface ResolveOptions {
  /** Drives the `runtimeMode` default. Pass `import.meta.env.DEV` or `mode !== 'production'`. */
  isDev?: boolean
  /**
   * True when the app is being served rather than bundled: under `vp dev`, and
   * under `vp preview`, whose bundle was validated when it was built. False for
   * a build.
   *
   * Relaxes exactly one rule: the placeholder-host check on the API URL. A
   * developer running production mode against a backend on their own machine
   * points at `localhost` on purpose; a BUILD that does the same deploys an app
   * that cannot reach its API. Every other rule — including demo mode forcing
   * MSW and the mock adapter — applies either way.
   *
   * `resolveRuntimeEnvWithOverlay` sets it for an API URL a deployment gave at
   * start, which is a deliberate choice in the same way.
   */
  serving?: boolean
  /**
   * The adapters the project registered in `auth.config.ts`, with the
   * transport each declares. Their names are accepted for
   * `VUESTRATA_AUTH_ADAPTER`, and the cross-field rules apply to them by
   * transport. The Vite plugin reads them from that file and passes them to
   * both parsers; leave it out and only the built-in names are valid.
   */
  authAdapters?: RegisteredAuthAdapters
  onWarn?: (message: string) => void
}

function normalize(raw: RawEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const key of Object.values(ENV_KEYS)) {
    out[key] = optional(raw[key])
  }
  return out
}

/** Turns validated-but-sparse fields into a fully-defaulted config. */
function applyDefaults(parsed: ParsedEnv, isDev: boolean): RuntimeEnv {
  const runtimeMode: RuntimeMode = parsed[ENV_KEYS.runtimeMode] ?? (isDev ? 'demo' : 'production')
  const demo = runtimeMode === 'demo'

  return {
    runtimeMode,
    title: parsed[ENV_KEYS.title] ?? 'Vuestrata',
    apiUrl: parsed[ENV_KEYS.apiUrl] ?? '/api',
    // Defaults follow the mode, so a correct demo/production config needs only
    // one variable set. Explicit values still win — and are then cross-checked.
    useMocks: parsed[ENV_KEYS.useMocks] ?? demo,
    // The schema checked the name against the built-in adapters and the ones
    // the build read from `auth.config.ts`. The type is the project's own
    // declaration of those (`RegisteredAuthAdapterNames`), which a schema
    // cannot see: the build says when the two disagree.
    authAdapter:
      (parsed[ENV_KEYS.authAdapter] as AuthAdapterName | undefined) ?? (demo ? 'mock' : 'jwt'),
    // Default to the strategy that cannot leak a long-lived credential. When
    // the backend does not set a refresh cookie the boot call simply 401s and
    // the user lands on the login page — exactly what happened before this
    // setting existed, so the default is never worse than the old behaviour,
    // and is strictly better against a backend that does support it.
    sessionPersistence: parsed[ENV_KEYS.sessionPersistence] ?? (demo ? 'none' : 'refresh-cookie'),
    iconProvider: parsed[ENV_KEYS.iconProvider] ?? 'solar',
    theme: parsed[ENV_KEYS.theme] ?? 'default',
    demoAuth: {
      retentionHours: parsed[ENV_KEYS.demoRetentionHours] ?? DEFAULT_RETENTION_HOURS,
    },
    errorReporting: {
      dsn: parsed[ENV_KEYS.errorReportingDsn],
      release: parsed[ENV_KEYS.release],
    },
  }
}

function formatFieldIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const key = issue.path.join('.') || '(root)'
    return `${key}: ${issue.message}`
  })
}

/**
 * Strict parse. Throws an aggregated error listing every problem at once.
 *
 * The Vite plugin (`scripts/vite/vuestrata-plugin.mjs`) calls this, so an
 * invalid deployment configuration fails the build rather than reaching a
 * browser.
 */
export function parseRuntimeEnv(raw: RawEnv, options: ResolveOptions = {}): RuntimeEnv {
  const { isDev = false, serving = false, authAdapters = {} } = options

  const parsed = createEnvSchema(authAdapters).safeParse(normalize(raw))
  if (!parsed.success) {
    throw new Error(
      `[vuestrata:env] Invalid environment configuration:\n  - ${formatFieldIssues(parsed.error).join('\n  - ')}`,
    )
  }

  const resolved = applyDefaults(parsed.data, isDev)
  const combination = collectCombinationIssues(resolved, serving, authAdapters)
  if (combination.length > 0) {
    throw new Error(
      `[vuestrata:env] Incompatible environment configuration:\n  - ${combination
        .map((issue) =>
          issue.placeholderApiUrl
            ? `${issue.message} ${describeDevProxyAlternative(issue.placeholderApiUrl)}`
            : issue.message,
        )
        .join('\n  - ')}`,
    )
  }

  return resolved
}

/**
 * Lenient parse. Never throws: invalid individual values fall back to their
 * defaults and invalid combinations are auto-corrected, each with a warning.
 *
 * Call this from application code. In a correctly built artifact it agrees
 * exactly with `parseRuntimeEnv`, because the build already validated the same
 * values — this path only matters for tests and hand-edited local setups.
 */
export function resolveRuntimeEnv(raw: RawEnv, options: ResolveOptions = {}): RuntimeEnv {
  const { isDev = false, serving = false, authAdapters = {}, onWarn } = options
  const warn = onWarn ?? (() => {})

  const normalized = normalize(raw)
  const envSchema = createEnvSchema(authAdapters)

  // Drop individually-invalid values so their defaults apply, warning per field.
  const parsed = envSchema.safeParse(normalized)
  let data: ParsedEnv
  if (parsed.success) {
    data = parsed.data
  } else {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      warn(`Ignoring invalid ${key}: ${issue.message}. Falling back to the default.`)
      if (key) delete normalized[key]
    }
    const retry = envSchema.safeParse(normalized)
    // Deleting every offending key cannot fail: all fields are optional.
    data = retry.success ? retry.data : {}
  }

  const resolved = applyDefaults(data, isDev)
  for (const issue of collectCombinationIssues(resolved, serving, authAdapters)) {
    warn(`${issue.message} Auto-correcting.`)
    issue.apply(resolved)
  }

  return resolved
}
