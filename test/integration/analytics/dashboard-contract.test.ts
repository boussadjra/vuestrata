import 'fake-indexeddb/auto'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test'

import { dashboardHandlers } from '@/mocks/handlers/dashboard'
import { createMockJwt } from '@/mocks/utils'
import {
  activityFeedSchema,
  activitySeriesSchema,
  attentionItemsSchema,
  dashboardStatsSchema,
  funnelSchema,
  revenueBreakdownSchema,
  systemHealthSchema,
  teamPerformanceSchema,
  upcomingEventsSchema,
} from '@/modules/analytics/types/dashboard'

/**
 * The dashboard API contract.
 *
 * The handler and the query used to declare completely different shapes — the
 * handler returned `activeUsers`/`growth`/`churnRate`, the query read
 * `activeProjects`/`satisfaction`/`*Trend` — and nothing failed. The dashboard
 * simply rendered empty sparklines, `0`, `—`, and an unformatted `48205`.
 *
 * These tests assert every endpoint against the SAME schema the query uses, so
 * that class of silent mismatch cannot recur.
 */

const server = setupServer(...dashboardHandlers)

const token = createMockJwt({ sub: '1', expiresInSeconds: 3600 })

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`http://localhost/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return { status: response.status, body: response.status === 204 ? null : await response.json() }
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('dashboard endpoints match their schemas', () => {
  const cases = [
    ['/dashboard/stats', dashboardStatsSchema],
    ['/dashboard/activity', activitySeriesSchema],
    ['/dashboard/revenue-breakdown', revenueBreakdownSchema],
    ['/dashboard/funnel', funnelSchema],
    ['/dashboard/team-performance', teamPerformanceSchema],
    ['/dashboard/recent-activity', activityFeedSchema],
    ['/dashboard/attention', attentionItemsSchema],
    ['/dashboard/upcoming', upcomingEventsSchema],
    ['/dashboard/health', systemHealthSchema],
  ] as const

  it.each(cases)('%s', async (path, schema) => {
    const { status, body } = await get(path)

    expect(status).toBe(200)
    // `parse` throws with the offending path on a mismatch, which is far more
    // useful than a boolean assertion.
    expect(() => schema.parse(body)).not.toThrow()
  })
})

describe('authentication', () => {
  it('rejects every dashboard endpoint without a valid token', async () => {
    for (const path of ['/dashboard/stats', '/dashboard/activity', '/dashboard/health']) {
      const response = await fetch(`http://localhost/api${path}`)
      expect(response.status, `${path} should require auth`).toBe(401)
    }
  })
})

describe('filters actually change the response', () => {
  it('returns one point per day for the requested range', async () => {
    for (const [range, expected] of [
      ['7d', 7],
      ['30d', 30],
      ['90d', 90],
    ] as const) {
      const { body } = await get(`/dashboard/activity?range=${range}&segment=all`)
      const parsed = activitySeriesSchema.parse(body)
      expect(parsed.points, `range=${range}`).toHaveLength(expected)
    }
  })

  it('scales figures by segment, so the filter visibly does something', async () => {
    const all = revenueBreakdownSchema.parse(
      (await get('/dashboard/revenue-breakdown?range=7d&segment=all')).body,
    )
    const enterprise = revenueBreakdownSchema.parse(
      (await get('/dashboard/revenue-breakdown?range=7d&segment=enterprise')).body,
    )

    const total = (data: typeof all) =>
      data.segments.reduce((sum, segment) => sum + segment.amount, 0)

    expect(total(enterprise)).toBeLessThan(total(all))
    // Shares are relative, so they stay comparable across segments.
    expect(enterprise.segments[0]!.share).toBeCloseTo(all.segments[0]!.share, 0)
  })

  it('is deterministic — the same request twice returns the same figures', async () => {
    // Seeded rather than random, so the demo is stable across reloads and
    // screenshots and e2e assertions are possible.
    const first = await get('/dashboard/activity?range=7d&segment=all')
    const second = await get('/dashboard/activity?range=7d&segment=all')

    expect(first.body).toEqual(second.body)
  })
})

describe('trend semantics', () => {
  it('reports a falling churn rate as an improvement, not a decline', async () => {
    // The distinction the schema exists for: "down" and "bad" are not the same
    // thing, and tying colour to direction would be wrong for churn.
    const stats = dashboardStatsSchema.parse((await get('/dashboard/stats?range=7d')).body)
    const churn = stats.kpis.find((kpi) => kpi.id === 'churnRate')

    expect(churn).toBeDefined()
    expect(churn!.trend.direction).toBe('down')
    expect(churn!.trend.isImprovement).toBe(true)
  })

  it('produces plausible period-over-period changes', async () => {
    // A 7-day window compared against its own first half reported "+69%".
    // Comparing against the equivalent PRIOR window keeps figures believable.
    const stats = dashboardStatsSchema.parse((await get('/dashboard/stats?range=7d')).body)

    for (const kpi of stats.kpis) {
      expect(Math.abs(kpi.trend.changePercent), `${kpi.id} change looks fabricated`).toBeLessThan(
        50,
      )
    }
  })

  it('charts only the reported window, not the comparison window', async () => {
    const stats = dashboardStatsSchema.parse((await get('/dashboard/stats?range=7d')).body)

    for (const kpi of stats.kpis) {
      expect(kpi.trend.history, `${kpi.id} sparkline length`).toHaveLength(7)
    }
  })
})

describe('money is never pre-formatted', () => {
  it('sends minor-unit integers plus a currency code', async () => {
    // A pre-formatted "$45,231" cannot be summed, compared, or localized, and
    // hardcodes English grouping for every locale.
    const breakdown = revenueBreakdownSchema.parse((await get('/dashboard/revenue-breakdown')).body)

    expect(breakdown.currency).toMatch(/^[A-Z]{3}$/)
    for (const segment of breakdown.segments) {
      expect(Number.isInteger(segment.amount)).toBe(true)
    }
  })
})
