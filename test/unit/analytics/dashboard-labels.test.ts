import { describe, expect, it } from 'vite-plus/test'

import {
  dashboardT,
  ensureDashboardMessages,
} from '@/modules/analytics/composables/useDashboardI18n'
import {
  kpiComparedTo,
  kpiTitle,
  revenueSourceLabel,
} from '@/modules/analytics/lib/dashboard-labels'
import { getI18n } from '@/plugins/i18n'

describe('dashboard i18n', () => {
  it('merges the full analytics catalog and translates dashboard keys', () => {
    ensureDashboardMessages()
    expect(dashboardT('dash_revenue_trend_title')).toBe('Revenue and activity')
    expect(dashboardT('dash_quick_actions_title')).toBe('Quick actions')
    expect(dashboardT('dash_attention_failed_payments')).toBe('Failed payments')
    expect(dashboardT('dash_funnel_stage_visited')).toBe('Visited')
    expect(dashboardT('dash_welcome_named', { name: 'Ada' })).toContain('Ada')
  })

  it('translates KPI and revenue labels instead of returning keys', () => {
    expect(kpiComparedTo('7d')).toBe('previous 7 days')
    expect(kpiTitle('revenue')).toBe('Revenue')
    expect(revenueSourceLabel('subscriptions', 'Subscriptions')).toBe('Subscriptions')
    expect(kpiComparedTo('7d')).not.toContain('dash_compared_')
    expect(revenueSourceLabel('one-time', 'One-time')).not.toContain('dash_source_')
  })

  it('follows the active locale', () => {
    const i18n = getI18n()
    const previous = i18n.global.locale.value
    i18n.global.locale.value = 'fr'

    try {
      expect(kpiComparedTo('7d')).toBe('7 jours précédents')
      expect(dashboardT('dash_revenue_split_title')).toBe('Revenus par source')
      expect(revenueSourceLabel('enterprise', 'Enterprise')).toBe('Entreprise')
    } finally {
      i18n.global.locale.value = previous
    }
  })
})
