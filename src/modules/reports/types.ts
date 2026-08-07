import { z } from 'zod'

import type { CollectionFilters } from '~/lib/api/collection-queries'
import { moneySchema } from '~/lib/money'

/** Saved-report contract. */

export const REPORT_KINDS = ['revenue', 'pipeline', 'usage', 'support', 'inventory'] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

export const REPORT_PERIODS = ['month', 'quarter', 'year'] as const
export type ReportPeriod = (typeof REPORT_PERIODS)[number]

/** One row of a report's result set. Reports are tabular by definition. */
export const reportRowSchema = z.object({
  label: z.string(),
  value: z.number(),
  /** Present only on monetary reports; `null` keeps the column shape stable. */
  amount: moneySchema.nullable(),
  changePercent: z.number(),
})
export type ReportRow = z.infer<typeof reportRowSchema>

export const reportSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(REPORT_KINDS),
  period: z.enum(REPORT_PERIODS),
  owner: z.string(),
  generatedAt: z.string(),
  /** Unit for `ReportRow.value` — "orders", "tickets", "seats". */
  unit: z.string(),
  rows: z.array(reportRowSchema),
})
export type Report = z.infer<typeof reportSchema>

export interface ReportFilters extends CollectionFilters {
  kind?: ReportKind | 'all'
  period?: ReportPeriod | 'all'
}
