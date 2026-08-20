/**
 * Performance-monitoring wiring.
 *
 * Mirrors `plugins/error-reporting.ts` exactly, including the fact that the
 * template ships no SDK: the demo has nowhere to send telemetry, and a template
 * should not force a vendor choice. Adding one is local to this file.
 *
 * Reuses `VUESTRATA_ERROR_REPORTING_DSN` rather than introducing a second
 * variable — every provider that ingests web vitals (Sentry, Datadog, an OTLP
 * collector) uses the same project endpoint for both signals, and two DSNs that
 * must agree is a configuration trap, not a feature.
 */
import { appConfig } from '~/config/app.config'
import { createScopedLogger } from '~/lib/logger'
import {
  installPerformanceReporter,
  startWebVitalsCollection,
  type PerformanceReporter,
} from '~/lib/observability/performance'

const observabilityLogger = createScopedLogger('observability')

export function installPerformanceMonitoring(): void {
  const dsn = appConfig.errorReporting.dsn
  if (!dsn) {
    // Not a warning: no DSN is the correct state for the demo and for local
    // development.
    observabilityLogger.debug('No DSN configured — web vitals are not collected.')
    return
  }

  const reporter = createPerformanceReporter()
  if (!reporter) return

  installPerformanceReporter(reporter)
  // Must follow the install: collection is skipped while the reporter is the
  // no-op, so that a deployment without telemetry does not pay for observers.
  startWebVitalsCollection({ release: appConfig.errorReporting.release })
}

/**
 * Build the provider-specific reporter.
 *
 * Returns null in the stock template because no SDK is installed. A reference
 * implementation, sending to an OTLP-style collector with no dependency:
 *
 * ```ts
 * return {
 *   name: 'beacon',
 *   reportMetric: (metric) => {
 *     // sendBeacon survives the page being discarded, which is exactly when
 *     // LCP and CLS are reported. fetch() would be cancelled.
 *     navigator.sendBeacon('/api/metrics', JSON.stringify(metric))
 *   },
 * }
 * ```
 *
 * For the full Core Web Vitals set — INP in particular, which is not safe to
 * approximate by hand — install `web-vitals` and forward its callbacks into
 * `reportMetric` instead of calling `startWebVitalsCollection`.
 */
function createPerformanceReporter(): PerformanceReporter | null {
  observabilityLogger.debug(
    'A DSN is configured but no performance reporter is implemented. ' +
      'Implement createPerformanceReporter() in src/modules/app/plugins/observability.ts.',
  )
  return null
}
