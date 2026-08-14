import { mount } from '@vue/test-utils'
import type { EChartsOption } from 'echarts'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { defineComponent, h } from 'vue'

import RevenueBreakdownPanel from '@/modules/analytics/components/RevenueBreakdownPanel.vue'
import type { RevenueBreakdown } from '@/modules/analytics/types/dashboard'

const SAMPLE: RevenueBreakdown = {
  currency: 'USD',
  segments: [
    { key: 'subscriptions', label: 'Subscriptions', amount: 2_400_000, share: 48 },
    { key: 'services', label: 'Services', amount: 1_600_000, share: 32 },
    { key: 'other', label: 'Other', amount: 1_000_000, share: 20 },
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
  setup:
    (_, { slots }) =>
    () =>
      h('div', slots.default?.()),
})

const UiPanelStub = defineComponent({
  name: 'UiPanel',
  setup:
    (_, { slots }) =>
    () =>
      h('section', slots.default?.()),
})

describe('RevenueBreakdownPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function mountPanel() {
    const pinia = createPinia()
    setActivePinia(pinia)
    return mount(RevenueBreakdownPanel, {
      props: { data: SAMPLE, loading: false, error: false },
      global: {
        plugins: [pinia],
        stubs: { BaseChart: BaseChartStub, UiPanel: UiPanelStub },
      },
    })
  }

  it('turns off the canvas legend so the share list is the only one', () => {
    const wrapper = mountPanel()
    const option = wrapper.getComponent(BaseChartStub).props('option') as EChartsOption

    expect(option.legend).toEqual({ show: false })

    const series = Array.isArray(option.series) ? option.series[0] : option.series
    expect(series && 'center' in series ? series.center : undefined).toEqual(['50%', '50%'])
  })

  it('lists each segment once, with its share', () => {
    const wrapper = mountPanel()
    const items = wrapper.findAll('li')

    expect(items).toHaveLength(3)
    expect(wrapper.text()).toContain('Subscriptions')
    expect(wrapper.text()).toContain('Services')
    expect(wrapper.find('ul').attributes('aria-hidden')).toBe('true')
  })
})
