import fs from 'node:fs'
import path from 'node:path'

import type { EChartsOption } from 'echarts'
import { describe, expect, it } from 'vite-plus/test'

import {
  buildGalleryChart,
  CHART_FAMILIES,
  CHART_GALLERY,
  type GalleryChartContext,
} from '@/modules/analytics/lib/chart-gallery'

type TestSeries = {
  type?: string
  data: unknown[]
  yAxisIndex?: number
}

// The application's i18n plugin compiles plain JSON imports into message ASTs.
// Read the source catalogs here so the factory receives translated strings.
function catalog(locale: 'en' | 'fr' | 'ar'): Record<string, string> {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), `src/modules/analytics/i18n/${locale}.json`), 'utf8'),
  ) as Record<string, string>
}

const en = catalog('en')
const fr = catalog('fr')
const ar = catalog('ar')

function context(messages: Record<string, string> = en): GalleryChartContext {
  return {
    palette: ['#205e7a', '#ab491f', '#667a30', '#7b529b', '#2e7770', '#997020'],
    foreground: '#10293c',
    mutedForeground: '#546570',
    border: '#ccd3db',
    surface: '#f5f7f9',
    fontFamily: 'Commissioner',
    t: (key) => {
      const message = messages[key]
      if (!message) throw new Error(`Missing chart translation: ${key}`)
      return message
    },
  }
}

function series(option: EChartsOption): TestSeries[] {
  const value = option.series
  return (Array.isArray(value) ? value : value ? [value] : []) as TestSeries[]
}

function expectFiniteNumbers(value: unknown) {
  if (typeof value === 'number') {
    expect(Number.isFinite(value)).toBe(true)
  } else if (Array.isArray(value)) {
    value.forEach(expectFiniteNumbers)
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(expectFiniteNumbers)
  }
}

function changeFirstNumber(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (typeof record[key] === 'number') {
      record[key] = 987_654
      return true
    }
    if (changeFirstNumber(record[key])) return true
  }
  return false
}

describe('chart gallery catalog', () => {
  it('offers at least fifty uniquely identified examples across all eight families', () => {
    expect(CHART_GALLERY.length).toBeGreaterThanOrEqual(50)
    expect(new Set(CHART_GALLERY.map((chart) => chart.id)).size).toBe(CHART_GALLERY.length)
    expect(CHART_FAMILIES).toHaveLength(8)
    expect(new Set(CHART_GALLERY.map((chart) => chart.family))).toEqual(new Set(CHART_FAMILIES))
  })

  for (const chart of CHART_GALLERY) {
    it(`${chart.id} provides deterministic finite chart data and a matching table shape`, () => {
      const first = buildGalleryChart(chart.id, context())
      const second = buildGalleryChart(chart.id, context())
      expect(JSON.stringify(first)).toBe(JSON.stringify(second))
      expectFiniteNumbers(first)
      expect(series(first.option).length).toBeGreaterThan(0)
      for (const item of series(first.option)) {
        expect(item.type).toBeTruthy()
        expect(item.data.length).toBeGreaterThan(0)
      }
      expect(first.dataColumns.length).toBeGreaterThan(1)
      expect(first.dataRows.length).toBeGreaterThan(0)
      for (const row of first.dataRows) {
        expect(row.label).not.toBe('')
        expect(row.values).toHaveLength(first.dataColumns.length - 1)
      }
    })
  }

  it.each([
    ['English', en],
    ['French', fr],
    ['Arabic', ar],
  ] as const)('translates every example, family and sample-table label in %s', (_, messages) => {
    const dictionary: Record<string, string> = messages
    for (const chart of CHART_GALLERY) {
      const key = `chart_gallery_${chart.id.replaceAll('-', '_')}`
      expect(dictionary[`${key}_title`]).toBeTruthy()
      expect(dictionary[`${key}_desc`]).toBeTruthy()
      expect(dictionary[`chart_gallery_family_${chart.family}`]).toBeTruthy()
      const data = buildGalleryChart(chart.id, context(dictionary))
      expect(JSON.stringify(data)).not.toContain('chart_gallery_')
    }
  })

  it('keeps returned data isolated between builds that share a theme context', () => {
    const theme = context()
    for (const chart of CHART_GALLERY) {
      const first = buildGalleryChart(chart.id, theme)
      const second = buildGalleryChart(chart.id, theme)
      const original = JSON.stringify(second)
      expect(
        changeFirstNumber(series(first.option)[0]!.data) || changeFirstNumber(first.option),
      ).toBe(true)
      first.dataRows[0]!.values[0] = -999
      expect(JSON.stringify(second)).toBe(original)
      expect(JSON.stringify(buildGalleryChart(chart.id, theme))).toBe(original)
    }
    const first = buildGalleryChart('line', theme)
    const second = buildGalleryChart('line', theme)
    const secondColors = [...(second.option.color as string[])]
    ;(first.option.color as string[])[0] = '#ffffff'
    expect(second.option.color).toEqual(secondColors)
    expect(theme.palette).toEqual(secondColors)
  })
})

describe('chart data integrity', () => {
  it('keeps revenue and order counts on separate axes with the same values in the table', () => {
    const chart = buildGalleryChart('dual-axis', context())
    const [revenue, orders] = series(chart.option)
    expect(chart.option.yAxis).toHaveLength(2)
    expect(revenue!.type).toBe('bar')
    expect(revenue!.yAxisIndex ?? 0).toBe(0)
    expect(orders!.type).toBe('line')
    expect(orders!.yAxisIndex).toBe(1)
    expect(revenue!.data).toEqual(chart.dataRows.map((row) => row.values[0]))
    expect(orders!.data).toEqual(chart.dataRows.map((row) => row.values[1]))
    expect(revenue!.data[0]).toBe(42)
    expect(orders!.data[0]).toBe(120)
  })

  it.each(['percent-area', 'percent-bar'] as const)('%s adds to 100 for every category', (id) => {
    const chart = buildGalleryChart(id, context())
    for (const [index, row] of chart.dataRows.entries()) {
      expect(row.values.reduce<number>((sum, value) => sum + Number(value), 0)).toBeCloseTo(100)
      expect(series(chart.option).map((item) => item.data[index])).toEqual(row.values)
    }
  })

  it('builds waterfall bars from signed changes and running totals', () => {
    const chart = buildGalleryChart('waterfall', context())
    const [spacers, bars] = series(chart.option)
    const values = bars!.data as Array<{ value: number }>
    let previousTotal = Number(chart.dataRows[0]!.values[0])
    expect(values[0]!.value).toBe(previousTotal)
    expect(spacers!.data[0]).toBe(0)
    for (let index = 1; index < chart.dataRows.length - 1; index++) {
      const [change, total] = chart.dataRows[index]!.values.map(Number)
      expect(total).toBe(previousTotal + change!)
      expect(spacers!.data[index]).toBe(Math.min(previousTotal, total!))
      expect(values[index]!.value).toBe(Math.abs(change!))
      previousTotal = total!
    }
    expect(previousTotal).toBe(124)
    expect(spacers!.data.at(-1)).toBe(0)
    expect(values.at(-1)!.value).toBe(previousTotal)
  })

  it.each(['boxplot', 'horizontal-boxplot'] as const)(
    '%s preserves its ordered five-number summaries in the sample table',
    (id) => {
      const chart = buildGalleryChart(id, context())
      const values = series(chart.option)[0]!.data as number[][]
      expect(values).toEqual(chart.dataRows.map((row) => row.values))
      for (const row of values) {
        expect(row).toHaveLength(5)
        expect([...row].sort((left, right) => left - right)).toEqual(row)
      }
    },
  )

  it('derives the regression fit from the displayed scatter points', () => {
    const chart = buildGalleryChart('scatter-regression', context())
    const [points, fit] = series(chart.option)
    const observed = points!.data as number[][]
    const fitted = fit!.data as number[][]
    const meanX = observed.reduce((sum, point) => sum + point[0]!, 0) / observed.length
    const meanY = observed.reduce((sum, point) => sum + point[1]!, 0) / observed.length
    const numerator = observed.reduce(
      (sum, point) => sum + (point[0]! - meanX) * (point[1]! - meanY),
      0,
    )
    const denominator = observed.reduce((sum, point) => sum + (point[0]! - meanX) ** 2, 0)
    const slope = numerator / denominator
    for (const [index, point] of observed.entries()) {
      const expected = meanY + slope * (point[0]! - meanX)
      expect(fitted[index]![0]).toBe(point[0])
      expect(fitted[index]![1]).toBeCloseTo(expected, 2)
      expect(chart.dataRows[index]!.values.slice(0, 3)).toEqual(point)
      expect(chart.dataRows[index]!.values.at(-1)).toBe(fitted[index]![1])
    }
  })
})
