import { z } from 'zod'

import { moneySchema } from '~/lib/money'

/**
 * Dashboard API contract.
 *
 * Defined once and consumed by BOTH sides: the MSW handlers build their
 * responses through `.parse()`, and the query composables validate through
 * `.parse()` on the way in. Neither can drift from the other without failing
 * loudly.
 *
 * They had drifted badly. `useDashboardStatsQuery` declared `activeProjects`,
 * `satisfaction`, a string `revenue`, and four trend arrays; the handler
 * returned `activeUsers`, `growth`, `newSignups`, `churnRate`, and a numeric
 * `revenue`. With mocks on, every sparkline rendered empty, two tiles showed
 * `0` and `—`, and revenue displayed as the raw number `48205`. Nothing failed
 * — it just silently showed the wrong thing.
 */

// ─── Shared primitives ────────────────────────────────────────────────────────

/** ISO-8601 date (YYYY-MM-DD). Formatting is the view's job, via `Intl`. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected an ISO date (YYYY-MM-DD)')

/**
 * Money now lives in `~/lib/money` — orders, catalog and billing need the same
 * schema, and a copy per module is a chance for one of them to decide `amount`
 * means whole units. Re-exported here so existing importers keep working.
 */
export { type Money } from '~/lib/money'
export { moneySchema }

/**
 * A metric's movement against the previous comparable period.
 *
 * `direction` is carried explicitly rather than derived from the sign of
 * `changePercent`, because "good" is not always "up" — a falling churn rate is
 * an improvement. `isImprovement` says which, so the UI never has to guess
 * whether green or red is correct.
 */
export const trendSchema = z.object({
  changePercent: z.number(),
  direction: z.enum(['up', 'down', 'flat']),
  isImprovement: z.boolean(),
  /** Human-readable comparison window, e.g. "vs. previous 7 days". */
  comparedTo: z.string(),
  /** Sparkline points, oldest first. */
  history: z.array(z.number()),
})
export type Trend = z.infer<typeof trendSchema>

// ─── KPI summary ──────────────────────────────────────────────────────────────

export const kpiSchema = z.object({
  id: z.enum(['revenue', 'activeUsers', 'newSignups', 'churnRate']),
  /** Raw value; `format` tells the view how to render it. */
  value: z.number(),
  format: z.enum(['currency', 'number', 'percent']),
  /** Present only when `format` is 'currency'. */
  currency: z.string().length(3).optional(),
  trend: trendSchema,
})
export type Kpi = z.infer<typeof kpiSchema>

export const dashboardStatsSchema = z.object({
  kpis: z.array(kpiSchema),
  /** When the underlying figures were last computed. */
  generatedAt: z.string(),
})
export type DashboardStats = z.infer<typeof dashboardStatsSchema>

// ─── Activity trend ───────────────────────────────────────────────────────────

export const activityPointSchema = z.object({
  date: isoDate,
  activeUsers: z.number().int().nonnegative(),
  revenue: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
})

export const activitySeriesSchema = z.object({
  currency: z.string().length(3),
  points: z.array(activityPointSchema),
})
export type ActivitySeries = z.infer<typeof activitySeriesSchema>

// ─── Revenue breakdown ────────────────────────────────────────────────────────

export const revenueBreakdownSchema = z.object({
  currency: z.string().length(3),
  segments: z.array(
    z.object({
      /** Stable key for i18n and colour assignment; not display text. */
      key: z.string(),
      label: z.string(),
      amount: z.number().int().nonnegative(),
      /** 0–100. Sent by the server so the client and server agree on rounding. */
      share: z.number().min(0).max(100),
    }),
  ),
})
export type RevenueBreakdown = z.infer<typeof revenueBreakdownSchema>

// ─── Conversion funnel ────────────────────────────────────────────────────────

export const funnelSchema = z.object({
  stages: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      count: z.number().int().nonnegative(),
      /** Share of the FIRST stage, 0–100. */
      conversionFromTop: z.number().min(0).max(100),
    }),
  ),
})
export type Funnel = z.infer<typeof funnelSchema>

// ─── Team performance ─────────────────────────────────────────────────────────

export const teamPerformanceSchema = z.object({
  teams: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      completed: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
      /** 0–100. */
      efficiency: z.number().min(0).max(100),
    }),
  ),
})
export type TeamPerformance = z.infer<typeof teamPerformanceSchema>

// ─── Recent activity feed ─────────────────────────────────────────────────────

export const activityFeedSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      /** Drives the icon and tone; the label is translated client-side. */
      type: z.enum(['payment', 'signup', 'upgrade', 'refund', 'cancellation']),
      actor: z.string(),
      amount: moneySchema.nullable(),
      occurredAt: z.string(),
      status: z.enum(['succeeded', 'pending', 'failed']),
    }),
  ),
})
export type ActivityFeed = z.infer<typeof activityFeedSchema>

// ─── Tasks needing attention ──────────────────────────────────────────────────

export const attentionItemsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      titleKey: z.string(),
      severity: z.enum(['critical', 'warning', 'info']),
      /** Where acting on this takes the user. */
      href: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
})
export type AttentionItems = z.infer<typeof attentionItemsSchema>

// ─── Upcoming events ──────────────────────────────────────────────────────────

export const upcomingEventsSchema = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      startsAt: z.string(),
      kind: z.enum(['release', 'review', 'maintenance', 'meeting']),
    }),
  ),
})
export type UpcomingEvents = z.infer<typeof upcomingEventsSchema>

// ─── System health ────────────────────────────────────────────────────────────

export const systemHealthSchema = z.object({
  services: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      status: z.enum(['operational', 'degraded', 'outage']),
      /** 0–100, over the reporting window. */
      uptimePercent: z.number().min(0).max(100),
      latencyMs: z.number().int().nonnegative(),
    }),
  ),
})
export type SystemHealth = z.infer<typeof systemHealthSchema>

// ─── Request parameters ───────────────────────────────────────────────────────

/**
 * The dashboard's filter state.
 *
 * Every endpoint takes the same pair, so changing the range or segment refetches
 * the whole board consistently instead of leaving panels on different windows.
 */
export const DASHBOARD_RANGES = ['7d', '30d', '90d'] as const
export type DashboardRange = (typeof DASHBOARD_RANGES)[number]

export const DASHBOARD_SEGMENTS = ['all', 'new', 'returning', 'enterprise'] as const
export type DashboardSegment = (typeof DASHBOARD_SEGMENTS)[number]

export interface DashboardFilters {
  range: DashboardRange
  segment: DashboardSegment
}
