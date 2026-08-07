/**
 * Seeded reports.
 *
 * Row labels are real dimensions (regions, plans, channels) and the values hold
 * a believable distribution — a long tail rather than five near-identical bars.
 * Uniform random values make every chart look the same and hide exactly the
 * kind of skew a report exists to reveal.
 */
import { money } from '~/lib/money'
import { PEOPLE_NAMES, createRng, hoursAgo, pick, randomInt } from '~/mocks/seed'

import type { Report, ReportKind, ReportPeriod, ReportRow } from '../types'

interface Seed {
  id: string
  name: string
  description: string
  kind: ReportKind
  period: ReportPeriod
  unit: string
  /** Row labels, ordered by expected magnitude, largest first. */
  labels: string[]
  /** Whether rows carry a money amount. */
  monetary: boolean
  /** Magnitude of the largest row. */
  peak: number
}

const SEEDS: Seed[] = [
  {
    id: 'RPT-2001',
    name: 'Revenue by region',
    description: 'Recognised revenue for the period, split by sales region.',
    kind: 'revenue',
    period: 'quarter',
    unit: 'orders',
    labels: ['EMEA', 'North America', 'APAC', 'LATAM', 'Africa'],
    monetary: true,
    peak: 1_240,
  },
  {
    id: 'RPT-2002',
    name: 'Revenue by plan',
    description: 'Recurring revenue contribution by subscription tier.',
    kind: 'revenue',
    period: 'month',
    unit: 'accounts',
    labels: ['Enterprise', 'Scale', 'Growth', 'Starter'],
    monetary: true,
    peak: 86,
  },
  {
    id: 'RPT-2003',
    name: 'Pipeline by stage',
    description: 'Open opportunities by stage, weighted by probability.',
    kind: 'pipeline',
    period: 'quarter',
    unit: 'opportunities',
    labels: ['Qualified', 'Discovery', 'Proposal', 'Negotiation', 'Verbal commit'],
    monetary: true,
    peak: 214,
  },
  {
    id: 'RPT-2004',
    name: 'API usage by tier',
    description: 'Monthly API call volume against contracted allowances.',
    kind: 'usage',
    period: 'month',
    unit: 'million calls',
    labels: ['Enterprise', 'Scale', 'Growth', 'Starter', 'Trial'],
    monetary: false,
    peak: 412,
  },
  {
    id: 'RPT-2005',
    name: 'Support volume by category',
    description: 'Tickets raised in the period, grouped by issue category.',
    kind: 'support',
    period: 'month',
    unit: 'tickets',
    labels: ['Connectivity', 'Firmware', 'Billing', 'Onboarding', 'Feature request', 'Data export'],
    monetary: false,
    peak: 318,
  },
  {
    id: 'RPT-2006',
    name: 'Stock turns by category',
    description: 'Inventory turnover for physically stocked lines.',
    kind: 'inventory',
    period: 'year',
    unit: 'turns',
    labels: ['Accessories', 'Hardware', 'Spares'],
    monetary: false,
    peak: 18,
  },
]

/**
 * Build rows with a decaying distribution.
 *
 * Each row is roughly 55–75% of the one above it, which is what real
 * categorical data looks like. Sampling uniformly at random produces five bars
 * of nearly equal height and a chart that communicates nothing.
 */
function buildRows(seed: Seed, rng: () => number): ReportRow[] {
  let magnitude = seed.peak

  return seed.labels.map((label) => {
    const value = Math.max(1, Math.round(magnitude))
    magnitude *= randomInt(rng, 55, 75) / 100

    return {
      label,
      value,
      // Money tracks the row's volume rather than being independent of it, so
      // the two columns of a monetary report agree with one another.
      amount: seed.monetary ? money(value * randomInt(rng, 180, 420) * 100) : null,
      changePercent: randomInt(rng, -180, 320) / 10,
    }
  })
}

export function createReportFixtures(): Report[] {
  const rng = createRng(90_210)

  return SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    description: seed.description,
    kind: seed.kind,
    period: seed.period,
    owner: pick(rng, PEOPLE_NAMES),
    generatedAt: hoursAgo(randomInt(rng, 1, 72)),
    unit: seed.unit,
    rows: buildRows(seed, rng),
  }))
}

export const reportFixtures = createReportFixtures()
