import { mount } from '@vue/test-utils'
import type { EChartsOption } from 'echarts'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import BaseChart from '@/components/ui/BaseChart.vue'

const SAMPLE: EChartsOption = {
  series: [{ type: 'pie', data: [{ name: 'A', value: 1 }] }],
}

const VChartStub = defineComponent({
  name: 'Echarts',
  props: {
    option: { type: Object, required: true },
  },
  setup: () => () => h('div'),
})

function stubMatchMedia(matchesQuery: (query: string) => boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matchesQuery(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

afterEach(() => {
  stubMatchMedia(() => false)
})

function mountChart(props: { option: EChartsOption }) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })
  return mount(BaseChart, {
    props,
    global: { plugins: [i18n], stubs: { Echarts: VChartStub } },
  })
}

describe('BaseChart reduced motion', () => {
  it('leaves ECharts animation alone when motion is allowed', () => {
    stubMatchMedia(() => false)
    const wrapper = mountChart({ option: SAMPLE })

    const option = wrapper.getComponent(VChartStub).props('option') as EChartsOption
    expect(option.animation).not.toBe(false)
  })

  it('disables canvas tweening when the user prefers reduced motion', () => {
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'))
    const wrapper = mountChart({ option: SAMPLE })

    const option = wrapper.getComponent(VChartStub).props('option') as EChartsOption
    expect(option.animation).toBe(false)
    expect(option.animationDuration).toBe(0)
    expect(option.animationDurationUpdate).toBe(0)
    expect(option.stateAnimation).toEqual({ duration: 0 })
  })

  it('keeps the canvas in an LTR coordinate system for RTL pages', () => {
    stubMatchMedia(() => false)
    const wrapper = mountChart({ option: SAMPLE })

    expect(wrapper.get('[dir="ltr"]')).toBeTruthy()
  })
})
