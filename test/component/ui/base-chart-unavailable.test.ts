import { flushPromises, mount } from '@vue/test-utils'
import type { EChartsOption } from 'echarts'
import { describe, expect, it, vi } from 'vite-plus/test'
import { createI18n } from 'vue-i18n'

import BaseChart from '@/components/ui/BaseChart.vue'
import en from '@/locales/en.json'

/**
 * The charting engine is a chunk of its own, fetched when the first chart
 * mounts. When it cannot be fetched (a deploy replaced it, the asset host is
 * unreachable), the chart is what fails, not the page it is on.
 *
 * In a file of its own because the failure is the module's: base-chart.test.ts
 * mocks `vue-echarts` to load, and a mock is per file.
 */
const { LOAD_FAILURE } = vi.hoisted(() => ({
  LOAD_FAILURE: new Error('Failed to fetch dynamically imported module: /assets/charts.js'),
}))

// The module "loads" and fails where the loader reads it, which is as close as
// a mock gets to an import that rejects: a factory that throws is reported by
// Vitest as a broken mock instead.
vi.mock('vue-echarts', () => ({
  get default() {
    throw LOAD_FAILURE
  },
}))

vi.mock('~/lib/echarts-setup', () => ({
  ensureEchartsRegistered: vi.fn(),
}))

const SAMPLE: EChartsOption = {
  series: [{ type: 'bar', data: [3, 5] }],
}

async function mountChart() {
  const errorHandler = vi.fn()
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  const wrapper = mount(BaseChart, {
    props: {
      option: SAMPLE,
      title: 'Revenue',
      dataColumns: ['Month', 'Revenue'],
      dataRows: [
        { label: 'January', values: [3] },
        { label: 'February', values: [5] },
      ],
    },
    global: { plugins: [i18n], config: { errorHandler } },
  })
  await flushPromises()
  return { wrapper, errorHandler, t: i18n.global.t }
}

describe('BaseChart when the charting engine cannot be loaded', () => {
  it('says so in place of the canvas', async () => {
    const { wrapper, t } = await mountChart()

    const unavailable = wrapper.get('[data-testid="chart-load-error"]')
    expect(unavailable.text()).toBe(t('chart_load_error'))
    expect(unavailable.text()).toMatch(/could not be loaded/)
    // Inside the box the chart would have filled, so the layout does not jump.
    expect(unavailable.element.parentElement?.className).toContain('h-72')
    // The host is pinned to LTR for the canvas; a sentence takes its own direction.
    expect(unavailable.attributes('dir')).toBe('auto')
    // Declared as a prop, so the error is not serialised into the markup.
    expect(unavailable.attributes('error')).toBeUndefined()
  })

  it('keeps what does not depend on the engine: the title and the data table', async () => {
    const { wrapper } = await mountChart()

    expect(wrapper.get('figcaption h2').text()).toBe('Revenue')
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.findComponent({ name: 'Echarts' }).exists()).toBe(false)
  })

  it('hands the failure to the error handling once, and does not throw it at the page', async () => {
    const { errorHandler } = await mountChart()

    expect(errorHandler).toHaveBeenCalledTimes(1)
    expect(errorHandler.mock.calls[0]?.[0]).toBe(LOAD_FAILURE)
  })
})
