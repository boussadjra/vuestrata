import { http, HttpResponse, delay } from 'msw'

import {
  DASHBOARD_RANGES,
  activityFeedSchema,
  activitySeriesSchema,
  attentionItemsSchema,
  dashboardStatsSchema,
  funnelSchema,
  revenueBreakdownSchema,
  systemHealthSchema,
  teamPerformanceSchema,
  upcomingEventsSchema,
  type DashboardRange,
} from '@/modules/analytics'

import { isValidToken, mockApiUrl } from '../utils'

/**
 * Dashboard mock backend.
 *
 * Every response is built through the shared zod schema, so a handler that
 * drifts from what the query expects fails HERE rather than silently rendering
 * the wrong thing. It had drifted: this file returned
 * `activeUsers`/`growth`/`churnRate` while the query read
 * `activeProjects`/`satisfaction`/`*Trend`, so the dashboard quietly showed
 * empty sparklines, `0`, `—`, and an unformatted `48205`.
 *
 * Data is DETERMINISTIC (seeded, not `Math.random()`) so the demo looks the
 * same on every load, screenshots are stable, and e2e can assert on it.
 */

const CURRENCY = 'USD'

const RANGE_DAYS: Record<DashboardRange, number> = { '7d': 7, '30d': 30, '90d': 90 }

/**
 * Segment multipliers. Filtering visibly changes the figures — a filter that
 * returns identical data teaches the reader it does nothing.
 */
const SEGMENT_WEIGHT: Record<string, number> = {
  all: 1,
  new: 0.28,
  returning: 0.61,
  enterprise: 0.34,
}

function parseRange(raw: string | null): DashboardRange {
  const value = raw ?? '7d'
  return (DASHBOARD_RANGES as readonly string[]).includes(value) ? (value as DashboardRange) : '7d'
}

function readFilters(request: Request): { days: number; weight: number; range: DashboardRange } {
  const url = new URL(request.url)
  const range = parseRange(url.searchParams.get('range'))
  const segment = url.searchParams.get('segment') ?? 'all'
  return {
    range,
    days: RANGE_DAYS[range],
    weight: SEGMENT_WEIGHT[segment] ?? 1,
  }
}

/**
 * Deterministic pseudo-random in [0,1) — a hash, not `Math.random()`, so the
 * same index always yields the same figure across reloads and test runs.
 */
function seeded(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function isoDaysAgo(daysAgo: number): string {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

/** A gently rising series with plausible weekday seasonality. */
function buildSeries(days: number, base: number, weight: number): number[] {
  return Array.from({ length: days }, (_, index) => {
    const dayOfWeek = (index + 4) % 7
    // Weekends dip, which is what a real B2B product does.
    const weekend = dayOfWeek === 5 || dayOfWeek === 6 ? 0.72 : 1
    const growth = 1 + index / (days * 4)
    const noise = 0.92 + seeded(index + base) * 0.16
    return Math.round(base * weight * weekend * growth * noise)
  })
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, n) => sum + n, 0) / values.length
}

/**
 * Compare the current window against the one immediately before it.
 *
 * `series` covers TWICE the reported window so the two halves are the same
 * length and, crucially, the same weekday phase. Splitting a single 7-day
 * window in half instead compares 3 days against 4 — and puts both weekend days
 * in the first half — which reported "+69% in 7 days" and flipped the sign on a
 * falling churn series.
 */
function percentChange(doubleWindow: number[], windowSize: number): number {
  const previous = mean(doubleWindow.slice(0, windowSize))
  const current = mean(doubleWindow.slice(windowSize))
  if (previous === 0) return 0
  return Number((((current - previous) / previous) * 100).toFixed(1))
}

/**
 * @param doubleWindow  2 × `windowSize` points; the second half is "current".
 * @param windowSize    Days in the reported window.
 */
function trendFor(
  doubleWindow: number[],
  windowSize: number,
  comparedTo: DashboardRange,
  higherIsBetter = true,
) {
  const changePercent = percentChange(doubleWindow, windowSize)
  // Only the current window is charted; the earlier half exists to compare against.
  const series = doubleWindow.slice(windowSize)
  const direction = changePercent > 0.5 ? 'up' : changePercent < -0.5 ? 'down' : 'flat'
  return {
    changePercent,
    direction: direction as 'up' | 'down' | 'flat',
    // "Improvement" is not "up": falling churn is good news.
    isImprovement: higherIsBetter ? changePercent >= 0 : changePercent <= 0,
    comparedTo,
    history: series,
  }
}

function unauthorized() {
  return HttpResponse.json({ message: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
}

export const dashboardHandlers = [
  http.get(mockApiUrl('/dashboard/stats'), async ({ request }) => {
    await delay(220)
    if (!isValidToken(request)) return unauthorized()

    const { days, weight, range } = readFilters(request)

    // Twice the window, so each metric can be compared against the equivalent
    // preceding period rather than against its own first half.
    const span = days * 2
    const revenue = buildSeries(span, 640_000, weight)
    const activeUsers = buildSeries(span, 8_240, weight)
    const signups = buildSeries(span, 312, weight)
    // Churn drifts down across the span, so its trend is an improvement.
    const churn = Array.from({ length: span }, (_, i) =>
      Number((3.4 - (i / span) * 1.2 + seeded(i) * 0.18).toFixed(2)),
    )

    const current = <T>(series: T[]) => series.slice(days)

    return HttpResponse.json(
      dashboardStatsSchema.parse({
        generatedAt: new Date().toISOString(),
        kpis: [
          {
            id: 'revenue',
            value: current(revenue).reduce((sum, n) => sum + n, 0),
            format: 'currency',
            currency: CURRENCY,
            trend: trendFor(revenue, days, range),
          },
          {
            id: 'activeUsers',
            value: activeUsers.at(-1) ?? 0,
            format: 'number',
            trend: trendFor(activeUsers, days, range),
          },
          {
            id: 'newSignups',
            value: current(signups).reduce((sum, n) => sum + n, 0),
            format: 'number',
            trend: trendFor(signups, days, range),
          },
          {
            id: 'churnRate',
            value: churn.at(-1) ?? 0,
            format: 'percent',
            trend: trendFor(churn, days, range, false),
          },
        ],
      }),
    )
  }),

  http.get(mockApiUrl('/dashboard/activity'), async ({ request }) => {
    await delay(220)
    if (!isValidToken(request)) return unauthorized()

    const { days, weight } = readFilters(request)
    const revenue = buildSeries(days, 640_000, weight)
    const users = buildSeries(days, 8_240, weight)
    const sessions = buildSeries(days, 13_100, weight)

    return HttpResponse.json(
      activitySeriesSchema.parse({
        currency: CURRENCY,
        points: Array.from({ length: days }, (_, index) => ({
          date: isoDaysAgo(days - 1 - index),
          revenue: revenue[index] ?? 0,
          activeUsers: users[index] ?? 0,
          sessions: sessions[index] ?? 0,
        })),
      }),
    )
  }),

  http.get(mockApiUrl('/dashboard/revenue-breakdown'), async ({ request }) => {
    await delay(200)
    if (!isValidToken(request)) return unauthorized()

    const { weight } = readFilters(request)
    const raw = [
      { key: 'subscriptions', label: 'Subscriptions', amount: 298_600 },
      { key: 'enterprise', label: 'Enterprise', amount: 164_200 },
      { key: 'one-time', label: 'One-time', amount: 73_800 },
      { key: 'add-ons', label: 'Add-ons', amount: 29_100 },
    ].map((segment) => ({ ...segment, amount: Math.round(segment.amount * weight) }))

    const total = raw.reduce((sum, segment) => sum + segment.amount, 0)

    return HttpResponse.json(
      revenueBreakdownSchema.parse({
        currency: CURRENCY,
        segments: raw.map((segment) => ({
          ...segment,
          share: total === 0 ? 0 : Number(((segment.amount / total) * 100).toFixed(1)),
        })),
      }),
    )
  }),

  http.get(mockApiUrl('/dashboard/funnel'), async ({ request }) => {
    await delay(200)
    if (!isValidToken(request)) return unauthorized()

    const { weight } = readFilters(request)
    const labels = ['Visited', 'Signed up', 'Activated', 'Trialled', 'Subscribed']
    const counts = [48_200, 18_940, 7_310, 3_820, 2_461].map((n) => Math.round(n * weight))
    const top = counts[0] || 1

    return HttpResponse.json(
      funnelSchema.parse({
        stages: counts.map((count, index) => ({
          key: labels[index]!.toLowerCase().replace(/\s+/g, '-'),
          label: labels[index]!,
          count,
          conversionFromTop: Number(((count / top) * 100).toFixed(1)),
        })),
      }),
    )
  }),

  http.get(mockApiUrl('/dashboard/team-performance'), async ({ request }) => {
    await delay(200)
    if (!isValidToken(request)) return unauthorized()

    return HttpResponse.json(
      teamPerformanceSchema.parse({
        teams: [
          { key: 'engineering', name: 'Engineering', completed: 128, total: 142, efficiency: 90 },
          { key: 'design', name: 'Design', completed: 81, total: 87, efficiency: 93 },
          { key: 'support', name: 'Support', completed: 195, total: 210, efficiency: 93 },
          { key: 'sales', name: 'Sales', completed: 88, total: 95, efficiency: 93 },
          { key: 'marketing', name: 'Marketing', completed: 52, total: 65, efficiency: 80 },
        ],
      }),
    )
  }),

  http.get(mockApiUrl('/dashboard/recent-activity'), async ({ request }) => {
    await delay(200)
    if (!isValidToken(request)) return unauthorized()

    const now = Date.now()
    const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString()

    return HttpResponse.json(
      activityFeedSchema.parse({
        items: [
          {
            id: 'act-1',
            type: 'payment',
            actor: 'Northwind Traders',
            amount: { amount: 124_900, currency: CURRENCY },
            occurredAt: minutesAgo(6),
            status: 'succeeded',
          },
          {
            id: 'act-2',
            type: 'signup',
            actor: 'Amara Okafor',
            amount: null,
            occurredAt: minutesAgo(23),
            status: 'succeeded',
          },
          {
            id: 'act-3',
            type: 'upgrade',
            actor: 'Lumen Studio',
            amount: { amount: 48_000, currency: CURRENCY },
            occurredAt: minutesAgo(74),
            status: 'succeeded',
          },
          {
            id: 'act-4',
            type: 'payment',
            actor: 'Kestrel Logistics',
            amount: { amount: 360_000, currency: CURRENCY },
            occurredAt: minutesAgo(122),
            status: 'pending',
          },
          {
            id: 'act-5',
            type: 'refund',
            actor: 'Pilcrow Media',
            amount: { amount: 12_900, currency: CURRENCY },
            occurredAt: minutesAgo(188),
            status: 'succeeded',
          },
          {
            id: 'act-6',
            type: 'cancellation',
            actor: 'Bright Harbour',
            amount: null,
            occurredAt: minutesAgo(240),
            status: 'failed',
          },
        ],
      }),
    )
  }),

  http.get(mockApiUrl('/dashboard/attention'), async ({ request }) => {
    await delay(180)
    if (!isValidToken(request)) return unauthorized()

    return HttpResponse.json(
      attentionItemsSchema.parse({
        items: [
          {
            id: 'att-1',
            titleKey: 'dash_attention_failed_payments',
            severity: 'critical',
            href: '/dashboard/billing',
            count: 3,
          },
          {
            id: 'att-2',
            titleKey: 'dash_attention_pending_invites',
            severity: 'warning',
            href: '/dashboard/users',
            count: 7,
          },
          {
            id: 'att-3',
            titleKey: 'dash_attention_expiring_trials',
            severity: 'warning',
            href: '/dashboard/billing',
            count: 12,
          },
          {
            id: 'att-4',
            titleKey: 'dash_attention_audit_review',
            severity: 'info',
            href: '/dashboard/audit',
            count: 24,
          },
        ],
      }),
    )
  }),

  http.get(mockApiUrl('/dashboard/upcoming'), async ({ request }) => {
    await delay(180)
    if (!isValidToken(request)) return unauthorized()

    const now = Date.now()
    const daysAhead = (days: number, hour: number) => {
      const date = new Date(now)
      date.setDate(date.getDate() + days)
      date.setHours(hour, 0, 0, 0)
      return date.toISOString()
    }

    return HttpResponse.json(
      upcomingEventsSchema.parse({
        events: [
          {
            id: 'evt-1',
            title: 'Quarterly business review',
            startsAt: daysAhead(1, 10),
            kind: 'review',
          },
          {
            id: 'evt-2',
            title: 'Release 2.4 rollout',
            startsAt: daysAhead(3, 14),
            kind: 'release',
          },
          {
            id: 'evt-3',
            title: 'Database maintenance window',
            startsAt: daysAhead(5, 2),
            kind: 'maintenance',
          },
          {
            id: 'evt-4',
            title: 'Customer advisory call',
            startsAt: daysAhead(8, 16),
            kind: 'meeting',
          },
        ],
      }),
    )
  }),

  http.get(mockApiUrl('/dashboard/health'), async ({ request }) => {
    await delay(160)
    if (!isValidToken(request)) return unauthorized()

    return HttpResponse.json(
      systemHealthSchema.parse({
        services: [
          { key: 'api', name: 'API', status: 'operational', uptimePercent: 99.98, latencyMs: 142 },
          {
            key: 'web',
            name: 'Web app',
            status: 'operational',
            uptimePercent: 99.99,
            latencyMs: 88,
          },
          {
            key: 'jobs',
            name: 'Background jobs',
            status: 'degraded',
            uptimePercent: 98.4,
            latencyMs: 1_260,
          },
          {
            key: 'search',
            name: 'Search',
            status: 'operational',
            uptimePercent: 99.9,
            latencyMs: 210,
          },
        ],
      }),
    )
  }),
]
