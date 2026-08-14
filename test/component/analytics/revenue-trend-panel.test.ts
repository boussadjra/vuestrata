import { mount } from '@vue/test-utils'
import type { EChartsOption } from 'echarts'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import RevenueTrendPanel from '@/modules/analytics/components/RevenueTrendPanel.vue'
import { REVENUE_Y_AXIS, USERS_Y_AXIS } from '@/modules/analytics/lib/activity-chart'
import type { ActivitySeries } from '@/modules/analytics/types/dashboard'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

const SAMPLE: ActivitySeries = {
  currency: 'USD',
  points: [
    { date: '2026-08-01', revenue: 640_000, activeUsers: 8_240, sessions: 13_100 },
    { date: '2026-08-02', revenue: 720_000, activeUsers: 8_400, sessions: 13_400 },
  ],
}

const BaseChartStub = defineComponent({
  name: 'BaseChart',
  props: {
    option: { type: Object, required: true },
    summary: { type: String, default: '' },
    dataColumns: { type: Array, default: () => [] },
    dataRows: { type: Array, default: () => [] },
    dataCaption: { type: String, default: '' },
    height: { type: String, default: '' },
  },
  setup: () => () => h('div'),
})

const UiPanelStub = defineComponent({
  name: 'UiPanel',
  setup:
    (_, { slots }) =>
    () =>
      h('section', slots.default?.()),
})

describe('RevenueTrendPanel chart option', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('plots major-unit revenue on its own axis and users on the other', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: {
        en: {
          dash_metric_revenue: 'Revenue',
          dash_metric_active_users: 'Active users',
          dash_revenue_trend_title: 'Revenue and activity',
          dash_revenue_trend_desc: 'Daily revenue against active users.',
          dash_revenue_trend_summary: '{days} {direction} {change} {latest}',
          dash_trend_up: 'up',
          dash_trend_down: 'down',
          common_date: 'Date',
        },
      },
    })

    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(RevenueTrendPanel, {
      props: { data: SAMPLE, loading: false, error: false },
      global: {
        plugins: [i18n, pinia],
        stubs: { BaseChart: BaseChartStub, UiPanel: UiPanelStub },
      },
    })

    const option = wrapper.getComponent(BaseChartStub).props('option') as EChartsOption
    const yAxis = option.yAxis
    expect(Array.isArray(yAxis) && yAxis).toHaveLength(2)

    const series = option.series as Array<{ yAxisIndex?: number; data?: number[] }>
    expect(series[0]?.yAxisIndex).toBe(REVENUE_Y_AXIS)
    expect(series[1]?.yAxisIndex).toBe(USERS_Y_AXIS)
    expect(series[0]?.data).toEqual([6_400, 7_200])
    expect(series[1]?.data).toEqual([8_240, 8_400])
  })
})
