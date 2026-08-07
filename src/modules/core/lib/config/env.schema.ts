/**
 * Centralized, runtime-validated environment configuration.
 *
 * This module is deliberately dependency-free apart from `zod`: it imports no
 * Vue, no logger, and — critically — no path aliases. That is what allows it to
 * be imported from BOTH `vite.config.ts` (which runs in Node before aliases
 * exist) and from application code via `app.config.ts`.
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
 * `__VUESTRATA_DEMO__` define in vite.config.ts.
 *
 *   demo       — public showcase. MSW intercepts everything; mock auth only.
 *   production — real deployment. No MSW, no demo state, real auth adapter.
 */
export const RUNTIME_MODES = ['production', 'demo'] as const
export const AUTH_ADAPTERS = ['mock', 'jwt', 'oauth'] as const
export const ICON_PROVIDERS = ['solar', 'lucide', 'phosphor'] as const

export type RuntimeMode = (typeof RUNTIME_MODES)[number]
export type AuthAdapterName = (typeof AUTH_ADAPTERS)[number]
export type IconProviderName = (typeof ICON_PROVIDERS)[number]

/** Canonical env keys. Referenced by docs, tests, and error messages. */
export const ENV_KEYS = {
  runtimeMode: 'VUESTRATA_RUNTIME_MODE',
  title: 'VUESTRATA_APP_TITLE',
  apiUrl: 'VUESTRATA_API_URL',
  useMocks: 'VUESTRATA_USE_MOCKS',
  authAdapter: 'VUESTRATA_AUTH_ADAPTER',
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
 * backend. Allowed in demo mode, rejected in production mode.
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
 * Per-field validation only. Cross-field rules live in `applyCombinationRules`
 * because they need the resolved defaults, which depend on `runtimeMode`.
 */
const envSchema = z.object({
  [ENV_KEYS.runtimeMode]: z.enum(RUNTIME_MODES).optional(),
  [ENV_KEYS.title]: z.string().min(1).optional(),
  [ENV_KEYS.apiUrl]: z.string().min(1).optional(),
  [ENV_KEYS.useMocks]: booleanish,
  [ENV_KEYS.authAdapter]: z.enum(AUTH_ADAPTERS).optional(),
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

// ─── Resolved shape ───────────────────────────────────────────────────────────

export interface RuntimeEnv {
  runtimeMode: RuntimeMode
  title: string
  apiUrl: string
  useMocks: boolean
  authAdapter: AuthAdapterName
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

type Correction = { message: string; apply: (draft: RuntimeEnv) => void }

/**
 * The cross-field rules that were entirely missing before: nothing stopped a
 * build from claiming `authAdapter=mock` with `useMocks=false`, which produces
 * an app whose auth endpoints simply do not exist.
 *
 * Each rule carries a correction so the lenient path can recover instead of
 * throwing. The strict path ignores the corrections and reports the messages.
 */
function collectCombinationIssues(env: RuntimeEnv): Correction[] {
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
        `Use "jwt" or "oauth", or set ${ENV_KEYS.runtimeMode}="demo".`,
      apply: (draft) => {
        draft.authAdapter = 'jwt'
      },
    })
  }

  const apiUrlIssue = describeApiUrlIssue(env.apiUrl)
  if (apiUrlIssue) {
    issues.push({
      message: `${ENV_KEYS.apiUrl} is not usable in production: ${apiUrlIssue}`,
      apply: (draft) => {
        draft.apiUrl = '/api'
      },
    })
  }

  return issues
}

/** Returns a human-readable problem with the URL, or null when it is fine. */
function describeApiUrlIssue(apiUrl: string): string | null {
  // A same-origin path is legitimate — it means "behind a reverse proxy".
  if (apiUrl.startsWith('/')) return null

  let parsed: URL
  try {
    parsed = new URL(apiUrl)
  } catch {
    return `"${apiUrl}" is neither an absolute URL nor a same-origin path starting with "/".`
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return `"${apiUrl}" must use http or https.`
  }
  if (PLACEHOLDER_API_HOSTS.has(parsed.hostname)) {
    return `"${apiUrl}" points at the placeholder host "${parsed.hostname}".`
  }
  return null
}

// ─── Resolution ───────────────────────────────────────────────────────────────

interface ResolveOptions {
  /** Drives the `runtimeMode` default. Pass `import.meta.env.DEV` or `mode !== 'production'`. */
  isDev?: boolean
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
function applyDefaults(parsed: z.infer<typeof envSchema>, isDev: boolean): RuntimeEnv {
  const runtimeMode: RuntimeMode = parsed[ENV_KEYS.runtimeMode] ?? (isDev ? 'demo' : 'production')
  const demo = runtimeMode === 'demo'

  return {
    runtimeMode,
    title: parsed[ENV_KEYS.title] ?? 'Vuestrata',
    apiUrl: parsed[ENV_KEYS.apiUrl] ?? '/api',
    // Defaults follow the mode, so a correct demo/production config needs only
    // one variable set. Explicit values still win — and are then cross-checked.
    useMocks: parsed[ENV_KEYS.useMocks] ?? demo,
    authAdapter: parsed[ENV_KEYS.authAdapter] ?? (demo ? 'mock' : 'jwt'),
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
 * Call this from `vite.config.ts` so an invalid deployment configuration fails
 * the build rather than reaching a browser.
 */
export function parseRuntimeEnv(raw: RawEnv, options: ResolveOptions = {}): RuntimeEnv {
  const { isDev = false } = options

  const parsed = envSchema.safeParse(normalize(raw))
  if (!parsed.success) {
    throw new Error(
      `[vuestrata:env] Invalid environment configuration:\n  - ${formatFieldIssues(parsed.error).join('\n  - ')}`,
    )
  }

  const resolved = applyDefaults(parsed.data, isDev)
  const combination = collectCombinationIssues(resolved)
  if (combination.length > 0) {
    throw new Error(
      `[vuestrata:env] Incompatible environment configuration:\n  - ${combination
        .map((issue) => issue.message)
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
  const { isDev = false, onWarn } = options
  const warn = onWarn ?? (() => {})

  const normalized = normalize(raw)

  // Drop individually-invalid values so their defaults apply, warning per field.
  const parsed = envSchema.safeParse(normalized)
  let data: z.infer<typeof envSchema>
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
  for (const issue of collectCombinationIssues(resolved)) {
    warn(`${issue.message} Auto-correcting.`)
    issue.apply(resolved)
  }

  return resolved
}
