/**
 * Billing quota rules.
 *
 * The thresholds used to exist only as nested ternaries inside a progress bar's
 * class binding, recomputed three times per metric.
 */
import { describe, it, expect } from 'vite-plus/test'

import {
  isUnlimited,
  UNLIMITED,
  usageMetricViews,
  usagePercent,
  usageSeverity,
} from '@/modules/billing/presentation'
import type { UsageMetrics } from '@/modules/billing/types'

describe('usagePercent', () => {
  it('reports the fraction used', () => {
    expect(usagePercent(50, 200)).toBe(25)
  })

  // An account that has overshot renders a full bar, not one that overflows
  // its own track.
  it('clamps at 100', () => {
    expect(usagePercent(500, 200)).toBe(100)
  })

  it('is 0 for an unlimited or zero limit rather than dividing by it', () => {
    expect(usagePercent(500, UNLIMITED)).toBe(0)
    expect(usagePercent(500, 0)).toBe(0)
  })
})

describe('isUnlimited', () => {
  it('treats a negative limit as unlimited', () => {
    expect(isUnlimited(UNLIMITED)).toBe(true)
    expect(isUnlimited(0)).toBe(false)
    expect(isUnlimited(10)).toBe(false)
  })
})

describe('usageSeverity', () => {
  it('escalates past the thresholds', () => {
    expect(usageSeverity(10, 100)).toBe('normal')
    expect(usageSeverity(60, 100)).toBe('normal')
    expect(usageSeverity(61, 100)).toBe('warning')
    expect(usageSeverity(80, 100)).toBe('warning')
    expect(usageSeverity(81, 100)).toBe('critical')
  })
})

describe('usageMetricViews', () => {
  const usage: UsageMetrics = {
    users: { current: 9, limit: 10 },
    storage: { current: 0.2, limit: 1 },
    apiCalls: { current: 245, limit: UNLIMITED },
  }

  // The identity of a metric is its key. The page used to build this object
  // keyed by translated labels and then branch on `key === 'Storage'`, which
  // silently picked the wrong unit in every non-English locale.
  it('keys each view by the metric id, not by a label', () => {
    expect(usageMetricViews(usage).map((view) => view.id)).toEqual(['users', 'storage', 'apiCalls'])
  })

  it('carries the derived percent and severity', () => {
    const [users] = usageMetricViews(usage)
    expect(users!.percent).toBe(90)
    expect(users!.severity).toBe('critical')
    expect(users!.unlimited).toBe(false)
  })

  it('flags an unlimited quota', () => {
    const apiCalls = usageMetricViews(usage).find((view) => view.id === 'apiCalls')!
    expect(apiCalls.unlimited).toBe(true)
    expect(apiCalls.percent).toBe(0)
  })
})
