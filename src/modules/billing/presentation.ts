/**
 * Billing presentation and quota rules.
 *
 * Plain functions rather than a composable: none of this needs reactivity, and
 * "is this account near its limit" is a rule worth asserting on directly.
 */
import type { PlanTier, UsageMetrics } from './types'

/** A limit below zero means unlimited — there is no quota to fill. */
export const UNLIMITED = -1

export function isUnlimited(limit: number): boolean {
  return limit < 0
}

/**
 * How full a quota is, 0–100.
 *
 * Clamped at 100 so an account that has overshot its limit renders a full bar
 * rather than one that overflows its track. An unlimited or zero limit has no
 * meaningful percentage, so it reads as 0 rather than as a division by zero.
 */
export function usagePercent(current: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min((current / limit) * 100, 100)
}

export type UsageSeverity = 'normal' | 'warning' | 'critical'

/**
 * How urgently a quota needs attention.
 *
 * Thresholds live here, once, instead of being written as two nested ternaries
 * in the class binding of a progress bar — the page previously recomputed
 * `usagePercent` three times per metric just to decide a colour.
 */
export function usageSeverity(current: number, limit: number): UsageSeverity {
  const percent = usagePercent(current, limit)
  if (percent > 80) return 'critical'
  if (percent > 60) return 'warning'
  return 'normal'
}

export type UsageMetricId = keyof UsageMetrics

export interface UsageMetricView {
  id: UsageMetricId
  current: number
  limit: number
  unlimited: boolean
  percent: number
  severity: UsageSeverity
}

/**
 * The three quota bars, already decided.
 *
 * The identity of a metric is its key, not its label: the page used to build
 * this object literal keyed by translated strings and then branch on
 * `key === 'Storage'` to choose a unit — which silently picked the wrong
 * formatting the moment the interface was not in English.
 */
export function usageMetricViews(usage: UsageMetrics): UsageMetricView[] {
  return (Object.keys(usage) as UsageMetricId[]).map((id) => {
    const { current, limit } = usage[id]
    return {
      id,
      current,
      limit,
      unlimited: isUnlimited(limit),
      percent: usagePercent(current, limit),
      severity: usageSeverity(current, limit),
    }
  })
}

/** Accent for a plan card's tier badge. */
const TIER_ACCENT: Record<PlanTier, string> = {
  free: 'bg-surface-400',
  starter: 'bg-accent-500',
  pro: 'bg-primary-500',
  enterprise: 'bg-secondary-500',
}

export function tierAccentClass(tier: PlanTier): string {
  return TIER_ACCENT[tier]
}
