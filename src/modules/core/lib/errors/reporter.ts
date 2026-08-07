import { createScopedLogger } from '~/lib/logger'

/**
 * Error-reporting integration point.
 *
 * Deliberately an interface with a no-op default rather than a direct Sentry
 * (or equivalent) dependency. The template must stay deployable without an
 * error vendor — the hosted demo has no DSN and should not carry an SDK — while
 * a real deployment can wire one in without touching call sites.
 *
 * Everything flows through `app.config.errorHandler` in main.ts, which remains
 * the single sink for render-time errors. Do not add reporters to components.
 */

const reporterLogger = createScopedLogger('error-reporter')

export interface ErrorReportContext {
  /** Where the error surfaced, e.g. 'vue:render', 'window:unhandledrejection'. */
  source: string
  /** Component name, route, or other non-sensitive locating information. */
  component?: string
  /** Vue's `info` string, or an equivalent breadcrumb. */
  info?: string
  /** Extra structured detail. Redacted before it leaves the process. */
  extra?: Record<string, unknown>
}

export interface ErrorReporter {
  readonly name: string
  captureException(error: unknown, context: ErrorReportContext): void
  /** Attach the signed-in user, or clear it on sign-out. */
  setUser(user: { id: string; email?: string } | null): void
  flush?(timeoutMs?: number): Promise<boolean>
}

/**
 * The default. Reports nowhere, costs nothing, and keeps every call site
 * unconditional so there is no `if (reporter)` sprinkled through the codebase.
 */
const noopReporter: ErrorReporter = {
  name: 'noop',
  captureException: () => {},
  setUser: () => {},
}

/**
 * Held on `globalThis` rather than a module-level `let` so the value survives
 * HMR module replacement and satisfies the module-scope-state lint rule, which
 * exists to stop exactly this kind of hidden mutable singleton from drifting
 * out of sync across module instances.
 */
const REPORTER_KEY = '__vuestrataErrorReporter'

type ReporterHost = typeof globalThis & { [REPORTER_KEY]?: ErrorReporter }

function host(): ReporterHost {
  return globalThis as ReporterHost
}

/**
 * Install a reporter. Call once during bootstrap, before the Vue error handler
 * runs. Installing twice replaces the previous reporter and warns — two active
 * reporters would double-report every error.
 */
export function installErrorReporter(reporter: ErrorReporter): void {
  const current = host()[REPORTER_KEY]
  if (current && current.name !== 'noop') {
    reporterLogger.warn(
      `Replacing the "${current.name}" error reporter with "${reporter.name}". ` +
        `Only one reporter should be installed.`,
    )
  }
  host()[REPORTER_KEY] = reporter
  reporterLogger.info(`Error reporting enabled via "${reporter.name}".`)
}

/** Remove any installed reporter. Primarily for tests. */
export function resetErrorReporter(): void {
  delete host()[REPORTER_KEY]
}

export function getErrorReporter(): ErrorReporter {
  return host()[REPORTER_KEY] ?? noopReporter
}

/**
 * Report an error. Safe to call unconditionally: with no reporter installed
 * this is a no-op, and a reporter that throws is contained here rather than
 * being allowed to replace the original error with its own.
 */
export function reportError(error: unknown, context: ErrorReportContext): void {
  try {
    getErrorReporter().captureException(error, context)
  } catch (reporterError) {
    reporterLogger.error('Error reporter threw while capturing an exception', {
      err: reporterError,
    })
  }
}

/** Associate subsequent reports with a user, or pass `null` on sign-out. */
export function setErrorReporterUser(user: { id: string; email?: string } | null): void {
  try {
    getErrorReporter().setUser(user)
  } catch (reporterError) {
    reporterLogger.error('Error reporter threw while setting the user', { err: reporterError })
  }
}
