import { appConfig } from '~/config/app.config'
import { installErrorReporter, type ErrorReporter } from '~/lib/errors'
import { createScopedLogger } from '~/lib/logger'

const reportingLogger = createScopedLogger('error-reporting')

/**
 * Wires up error reporting, if the deployment has configured a provider.
 *
 * The template ships with NO error-reporting SDK in its dependencies. That is
 * deliberate: the hosted demo has nowhere to send errors, and a template should
 * not force a vendor choice on the applications built from it. Adding one is a
 * two-step change, both local to this file:
 *
 *   1. `vp add @sentry/vue` (or your provider's SDK)
 *   2. implement `createReporter()` below
 *
 * Everything else already routes through `reportError()`, so no call site
 * changes. See `core/lib/errors/reporter.ts` for the contract.
 *
 * The provider SDK must be loaded with a dynamic `import()` inside the
 * `dsn`-guarded branch so deployments without a DSN — including the demo — do
 * not download it.
 */
export async function installErrorReporting(): Promise<void> {
  const dsn = appConfig.errorReporting.dsn

  if (!dsn) {
    // Not a warning: no DSN is the correct, expected state for the demo and for
    // local development.
    reportingLogger.debug('No DSN configured — errors are logged locally only.')
    return
  }

  const reporter = await createReporter(dsn)
  if (reporter) installErrorReporter(reporter)
}

/**
 * Build the provider-specific reporter.
 *
 * Returns `null` in the stock template because no SDK is installed. Replace the
 * body with your provider's initialization; the surrounding wiring, redaction,
 * and single-sink guarantees are already in place.
 *
 * A reference implementation for Sentry:
 *
 * ```ts
 * const Sentry = await import('@sentry/vue')
 * Sentry.init({
 *   dsn,
 *   release: appConfig.errorReporting.release,
 *   environment: appConfig.runtimeMode,
 *   // Never send the demo's fabricated data or local noise upstream.
 *   enabled: appConfig.runtimeMode === 'production',
 * })
 * return {
 *   name: 'sentry',
 *   captureException: (error, context) =>
 *     Sentry.captureException(error, { tags: { source: context.source }, extra: context.extra }),
 *   setUser: (user) => Sentry.setUser(user),
 *   flush: (timeoutMs) => Sentry.flush(timeoutMs),
 * }
 * ```
 */
async function createReporter(dsn: string): Promise<ErrorReporter | null> {
  reportingLogger.warn(
    `A DSN is configured (${dsn.slice(0, 12)}…) but no reporter is implemented. ` +
      `Implement createReporter() in src/modules/app/plugins/error-reporting.ts.`,
  )
  return null
}
