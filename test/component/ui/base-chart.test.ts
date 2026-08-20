import { flushPromises, mount } from '@vue/test-utils'
import type { EChartsOption } from 'echarts'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createI18n } from 'vue-i18n'

import BaseChart from '@/components/ui/BaseChart.vue'

/**
 * `vue-echarts` is loaded through `defineAsyncComponent` so that echarts stays
 * out of BaseChart's static import graph — see the note in BaseChart.vue.
 *
 * That makes the real module a dynamic import, so it is mocked at the MODULE
 * level rather than stubbed by name: a `stubs: { Echarts }` entry cannot match
 * a component that does not exist until its chunk resolves. Every mount below
 * therefore awaits `flushPromises()` before asserting, which is what lets the
 * async component settle.
 */
vi.mock('vue-echarts', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'Echarts',
      props: { option: { type: Object, required: true } },
      setup: () => () => h('div'),
    }),
  }
})

vi.mock('~/lib/echarts-setup', () => ({
  ensureEchartsRegistered: vi.fn(),
}))

const SAMPLE: EChartsOption = {
  series: [{ type: 'pie', data: [{ name: 'A', value: 1 }] }],
}

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

async function mountChart(props: { option: EChartsOption }) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })
  const wrapper = mount(BaseChart, { props, global: { plugins: [i18n] } })
  // Resolve the async chart component before anything inspects its props.
  await flushPromises()
  return wrapper
}

function chartOption(wrapper: Awaited<ReturnType<typeof mountChart>>): EChartsOption {
  const chart = wrapper.findComponent({ name: 'Echarts' })
  expect(chart.exists(), 'the async chart component did not resolve').toBe(true)
  return chart.props('option') as EChartsOption
}

describe('BaseChart reduced motion', () => {
  it('leaves ECharts animation alone when motion is allowed', async () => {
    stubMatchMedia(() => false)
    const wrapper = await mountChart({ option: SAMPLE })

    expect(chartOption(wrapper).animation).not.toBe(false)
  })

  it('disables canvas tweening when the user prefers reduced motion', async () => {
    stubMatchMedia((query) => query.includes('prefers-reduced-motion'))
    const wrapper = await mountChart({ option: SAMPLE })

    const option = chartOption(wrapper)
    expect(option.animation).toBe(false)
    expect(option.animationDuration).toBe(0)
    expect(option.animationDurationUpdate).toBe(0)
    expect(option.stateAnimation).toEqual({ duration: 0 })
  })

  it('keeps the canvas in an LTR coordinate system for RTL pages', async () => {
    stubMatchMedia(() => false)
    const wrapper = await mountChart({ option: SAMPLE })

    expect(wrapper.get('[dir="ltr"]')).toBeTruthy()
  })
})

describe('BaseChart lazy loading', () => {
  it('does not render the chart component before its chunk resolves', () => {
    stubMatchMedia(() => false)
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

    // Mounted but NOT flushed: this is the state a real user sees for as long
    // as the charting chunk is in flight, and the figure must still render
    // rather than throwing or collapsing.
    const wrapper = mount(BaseChart, {
      props: { option: SAMPLE, height: 'h-72' },
      global: { plugins: [i18n] },
    })

    expect(wrapper.findComponent({ name: 'Echarts' }).exists()).toBe(false)
    expect(wrapper.get('[dir="ltr"]')).toBeTruthy()
  })
})
