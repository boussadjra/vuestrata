/**
 * Real-user performance monitoring.
 *
 * Errors already had a well-shaped integration point (`errors/reporter.ts`) and
 * performance had nothing at all — not even an interface. A deployment could
 * see that something threw, but not that the dashboard took eleven seconds to
 * paint, which is the failure users actually complain about.
 *
 * Same design as the error reporter, for the same reasons: an interface with a
 * no-op default, so the template ships no vendor SDK, the demo carries no
 * telemetry, and call sites stay unconditional.
 *
 * ## What this collects
 *
 * Metrics available directly from standard `PerformanceObserver` entries, with
 * no library and no vendor: TTFB, FCP, LCP and CLS.
 *
 * INP is deliberately NOT implemented here. Measuring it correctly means
 * tracking interaction latency across every event type and reconciling
 * overlapping interactions — that is what the `web-vitals` package exists for,
 * and a hand-rolled approximation would report numbers that look authoritative
 * and are wrong. To collect the full Core Web Vitals set, install `web-vitals`
 * and feed it into `reportMetric` from `installPerformanceReporter`'s caller;
 * the sink below does not care where a metric came from.
 */
import { createScopedLogger } from '../logger'

const perfLogger = createScopedLogger('performance')

/** Metric names this module emits natively. Any string is accepted by the sink. */
export type WebVitalName = 'TTFB' | 'FCP' | 'LCP' | 'CLS'

export interface PerformanceMetric {
  /** e.g. 'LCP'. Free-form so a caller can add its own timings. */
  name: string
  /** Milliseconds, except CLS which is a unitless layout-shift score. */
  value: number
  /** The route the metric was observed on, when known. */
  route?: string
  /** Build identifier, so a regression can be tied to a deploy. */
  release?: string
}

export interface PerformanceReporter {
  readonly name: string
  reportMetric(metric: PerformanceMetric): void
}

/** Reports nowhere. Keeps every call site unconditional. */
const noopReporter: PerformanceReporter = {
  name: 'noop',
  reportMetric: () => {},
}

/**
 * Held on `globalThis` rather than a module-level `let`, matching the error
 * reporter: the value survives HMR module replacement and satisfies the
 * module-scope-state lint rule.
 */
const REPORTER_KEY = '__vuestrataPerformanceReporter'

type ReporterHost = typeof globalThis & { [REPORTER_KEY]?: PerformanceReporter }

function host(): ReporterHost {
  return globalThis as ReporterHost
}

export function installPerformanceReporter(reporter: PerformanceReporter): void {
  const current = host()[REPORTER_KEY]
  if (current && current.name !== 'noop') {
    perfLogger.warn(
      `Replacing the "${current.name}" performance reporter with "${reporter.name}". ` +
        `Only one reporter should be installed.`,
    )
  }
  host()[REPORTER_KEY] = reporter
  perfLogger.info(`Performance reporting enabled via "${reporter.name}".`)
}

/** Remove any installed reporter. Primarily for tests. */
export function resetPerformanceReporter(): void {
  delete host()[REPORTER_KEY]
}

export function getPerformanceReporter(): PerformanceReporter {
  return host()[REPORTER_KEY] ?? noopReporter
}

/**
 * Report a metric. Safe to call unconditionally; a reporter that throws is
 * contained here rather than being allowed to break the page it is measuring.
 */
export function reportMetric(metric: PerformanceMetric): void {
  try {
    getPerformanceReporter().reportMetric(metric)
  } catch (err) {
    perfLogger.error('Performance reporter threw while reporting a metric', { err })
  }
}

/**
 * Subscribe to one entry type, ignoring types this browser does not support.
 *
 * `PerformanceObserver.observe` THROWS on an unknown `type` rather than being
 * a no-op, so an unguarded call breaks the whole collector on any engine
 * missing one entry type — which is the normal state of affairs for LCP.
 */
function observe(type: string, callback: (entries: PerformanceEntryList) => void): void {
  try {
    const observer = new PerformanceObserver((list) => callback(list.getEntries()))
    // `buffered` replays entries recorded before this ran — without it, FCP and
    // navigation timing are usually already past by the time the app boots.
    observer.observe({ type, buffered: true })
  } catch {
    // Unsupported entry type in this browser. Nothing to collect, nothing to
    // report, and certainly nothing to fail over.
  }
}

/**
 * Start collecting web vitals.
 *
 * No-op when nothing is listening: with no reporter installed there is no point
 * paying for observers, and the demo should not run telemetry it cannot send.
 * Call AFTER installing a reporter.
 */
export function startWebVitalsCollection(context: { release?: string } = {}): void {
  if (typeof PerformanceObserver === 'undefined') return
  if (getPerformanceReporter().name === 'noop') {
    perfLogger.debug('No performance reporter installed — skipping web-vitals collection.')
    return
  }

  const emit = (name: WebVitalName, value: number) => {
    reportMetric({
      name,
      value,
      release: context.release,
      route: typeof location === 'undefined' ? undefined : location.pathname,
    })
  }

  observe('navigation', (entries) => {
    for (const entry of entries) {
      const nav = entry as PerformanceNavigationTiming
      emit('TTFB', nav.responseStart - nav.requestStart)
    }
  })

  observe('paint', (entries) => {
    for (const entry of entries) {
      if (entry.name === 'first-contentful-paint') emit('FCP', entry.startTime)
    }
  })

  // LCP fires repeatedly as larger elements paint; the LAST value before the
  // page is backgrounded is the real one, so it is reported on hide rather
  // than per entry.
  let lcp = 0
  observe('largest-contentful-paint', (entries) => {
    for (const entry of entries) lcp = Math.max(lcp, entry.startTime)
  })

  // CLS accumulates across the page's lifetime, excluding shifts that follow
  // recent user input — those are expected, not layout instability.
  let cls = 0
  observe('layout-shift', (entries) => {
    for (const entry of entries) {
      const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }
      if (!shift.hadRecentInput) cls += shift.value
    }
  })

  if (typeof document !== 'undefined') {
    // `visibilitychange` → hidden, not `beforeunload`: mobile browsers routinely
    // discard a page without ever firing unload handlers, so a beforeunload
    // listener loses exactly the sessions most worth measuring.
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState !== 'hidden') return
        if (lcp > 0) emit('LCP', lcp)
        emit('CLS', cls)
      },
      { once: true },
    )
  }
}
