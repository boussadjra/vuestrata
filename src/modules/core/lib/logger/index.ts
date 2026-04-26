import { createConsola } from 'consola'

const rawLogger = createConsola({
  level: import.meta.env.PROD ? 3 : 5, // warn+ in prod, all in dev
})

/**
 * Keys whose values must never reach the log sink. The match is against the
 * lower-cased key name. Both exact and substring patterns are covered by the
 * regex, so `refresh_token`, `authToken`, `X-CSRF-Token`, etc. are redacted.
 */
const SENSITIVE_KEY_PATTERN =
  /^(?:password|passwd|pwd|secret|salt|pin|otp|ssn|cookie)$|token|authorization|api[_-]?key|credit.?card|cvv|private.?key|refresh/i

const REDACTED = '[REDACTED]'
const MAX_DEPTH = 6
const MAX_STRING = 2000

/**
 * Deep-clone a value while redacting keys that look sensitive and trimming
 * oversized strings. Runs on every logger argument so that accidentally
 * passing an auth header, refresh token, or full user object cannot end up
 * in persisted log sinks or remote telemetry shippers downstream.
 */
function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>(), path = '$'): unknown {
  if (value === null || value === undefined) return value
  const t = typeof value
  if (t === 'string') {
    return (value as string).length > MAX_STRING
      ? `${(value as string).slice(0, MAX_STRING)}\u2026[truncated]`
      : value
  }
  if (t === 'number' || t === 'boolean' || t === 'bigint') return value
  if (t === 'function' || t === 'symbol') return `[${t}]`
  if (depth >= MAX_DEPTH) return `[MaxDepth at ${path}]`

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitize(value.message, depth + 1, seen, `${path}.message`),
      // Stack traces can embed query strings / tokens; keep only the head so
      // callers still get a useful pointer without leaking everything.
      stack:
        typeof value.stack === 'string'
          ? value.stack.split('\n').slice(0, 5).join('\n')
          : undefined,
    }
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    return value.map((v, i) => sanitize(v, depth + 1, seen, `${path}[${i}]`))
  }

  if (t === 'object') {
    const obj = value as Record<string, unknown>
    if (seen.has(obj)) return '[Circular]'
    seen.add(obj)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = REDACTED
        continue
      }
      out[k] = sanitize(v, depth + 1, seen, `${path}.${k}`)
    }
    return out
  }

  return String(value as { toString?: () => string })
}

/**
 * Wrap a consola-compatible logger so every message passes through `sanitize`
 * before reaching the underlying transport. We keep a minimal facade \u2014 only
 * the level methods actually used across the codebase \u2014 to avoid bloating the
 * surface and to make it explicit which paths are sanitized.
 */
type LogFn = (...args: unknown[]) => void
interface LogFacade {
  fatal: LogFn
  error: LogFn
  warn: LogFn
  info: LogFn
  debug: LogFn
  trace: LogFn
  log: LogFn
  withTag: (tag: string) => LogFacade
}

function wrap(target: { withTag(tag: string): unknown } & Record<string, unknown>): LogFacade {
  const call = (method: string): LogFn => {
    const fn = target[method]
    if (typeof fn !== 'function') return () => {}
    return (...args: unknown[]) => {
      const safe = args.map((a) => sanitize(a))
      ;(fn as (...a: unknown[]) => void).apply(target, safe)
    }
  }
  return {
    fatal: call('fatal'),
    error: call('error'),
    warn: call('warn'),
    info: call('info'),
    debug: call('debug'),
    trace: call('trace'),
    log: call('log'),
    withTag: (tag: string) =>
      wrap(target.withTag(tag) as { withTag(tag: string): unknown } & Record<string, unknown>),
  }
}

export const logger: LogFacade = wrap(
  rawLogger as unknown as { withTag(tag: string): unknown } & Record<string, unknown>,
)

/**
 * Create a scoped logger instance.
 * Usage: const log = createScopedLogger('auth')
 *        log.info('User logged in')
 */
export function createScopedLogger(tag: string): LogFacade {
  return logger.withTag(tag)
}
