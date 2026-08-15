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
    { key: 'subscriptions', label: 'Subscriptions', amount: 2_400_000, share: 52.8 },
    { key: 'enterprise', label: 'Enterprise', amount: 1_320_000, share: 29.0 },
    { key: 'one-time', label: 'One-time', amount: 590_000, share: 13.0 },
    { key: 'add-ons', label: 'Add-ons', amount: 230_000, share: 5.1 },
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

    expect(items).toHaveLength(4)
    expect(wrapper.text()).toContain('Subscriptions')
    expect(wrapper.text()).toContain('Enterprise')
    expect(wrapper.text()).toContain('One-time')
    expect(wrapper.text()).toContain('Add-ons')
    expect(wrapper.text()).not.toContain('dash_source_')
    expect(wrapper.find('ul').attributes('aria-hidden')).toBe('true')
  })
})
