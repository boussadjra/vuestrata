import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vite-plus/test'

import DashboardKpiRow from '@/modules/analytics/components/DashboardKpiRow.vue'
import type { DashboardStats } from '@/modules/analytics/types/dashboard'
import { getI18n } from '@/plugins/i18n'

function stats(comparedTo: '7d' | '30d' | '90d' = '7d'): DashboardStats {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    kpis: [
      {
        id: 'activeUsers',
        value: 1200,
        format: 'number',
        trend: {
          changePercent: 4.2,
          direction: 'up',
          isImprovement: true,
          comparedTo,
          history: [1100, 1120, 1140, 1160, 1180, 1190, 1200],
        },
      },
    ],
  }
}

describe('DashboardKpiRow', () => {
  it('emits retry from the error empty state', async () => {
    const wrapper = mount(DashboardKpiRow, {
      props: { data: undefined, loading: false, error: true },
    })

    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('translates the comparison window instead of rendering the range key', () => {
    const wrapper = mount(DashboardKpiRow, {
      props: { data: stats('7d'), loading: false, error: false },
    })

    expect(wrapper.text()).toContain('previous 7 days')
    expect(wrapper.text()).toContain('Active users')
    expect(wrapper.text()).not.toMatch(/\b7d\b/)
  })

  it('localizes the comparison window for the active locale', () => {
    const i18n = getI18n()
    const previous = i18n.global.locale.value
    i18n.global.locale.value = 'fr'

    try {
      const wrapper = mount(DashboardKpiRow, {
        props: { data: stats('7d'), loading: false, error: false },
      })

      expect(wrapper.text()).toContain('7 jours précédents')
      expect(wrapper.text()).not.toContain('previous 7 days')
    } finally {
      i18n.global.locale.value = previous
    }
  })
})
