<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { useI18n } from 'vue-i18n'

import { UiPanel } from '@/components/ui'
import BaseChart from '@/components/ui/BaseChart.vue'
import { useFormatters } from '@/composables/useFormatters'
import { toMinorUnits } from '~/lib/money'

import { useChartColors, withAlpha } from '../composables/useChartColors'
import { activityChartSeries, REVENUE_Y_AXIS, USERS_Y_AXIS } from '../lib/activity-chart'
import type { ActivitySeries } from '../types/dashboard'

const props = defineProps<{
  data: ActivitySeries | undefined
  loading: boolean
  error: boolean
  updating?: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()
const { currency, number, date } = useFormatters()
const chart = useChartColors()

const points = computed(() => props.data?.points ?? [])
const isEmpty = computed(() => points.value.length === 0)
const currencyCode = computed(() => props.data?.currency ?? 'USD')

const labels = computed(() => points.value.map((point) => date(point.date)))
const series = computed(() => activityChartSeries(points.value))

function formatMoneyTick(majorUnits: number): string {
  return currency(toMinorUnits(majorUnits), currencyCode.value, true)
}

function formatTooltip(params: unknown): string {
  const items = (Array.isArray(params) ? params : [params]) as Array<{
    seriesIndex?: number
    marker?: string
    seriesName?: string
    name?: string
    axisValueLabel?: string
    value?: unknown
  }>
  if (items.length === 0) return ''
  const header = String(items[0]?.axisValueLabel ?? items[0]?.name ?? '')
  const rows = items.map((item) => {
    const raw = typeof item.value === 'number' ? item.value : 0
    const formatted =
      item.seriesIndex === REVENUE_Y_AXIS
        ? currency(toMinorUnits(raw), currencyCode.value)
        : number(raw)
    return `${item.marker ?? ''}${item.seriesName ?? ''}: ${formatted}`
  })
  return [header, ...rows].join('<br/>')
}

const option = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis', ...chart.tooltip.value, formatter: formatTooltip },
  legend: { top: 0, ...chart.legend.value },
  // Dual axes need room on both sides; `containLabel` grows the grid around ticks.
  grid: { left: '2%', right: '2%', bottom: '3%', top: '18%', containLabel: true },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: labels.value,
    axisLabel: chart.axisLabel.value,
    axisTick: { show: false },
    axisLine: chart.axisLine.value,
  },
  // Dual axis, not a split chart: the overlay is the point of this panel
  // (does revenue move with activity?). Independent scales keep each series
  // readable; splitting would spend a second panel on the same question.
  yAxis: [
    {
      type: 'value',
      position: 'left',
      axisLabel: { ...chart.axisLabel.value, formatter: (value: number) => formatMoneyTick(value) },
      splitLine: chart.splitLine.value,
      axisLine: { show: false },
    },
    {
      type: 'value',
      position: 'right',
      alignTicks: true,
      axisLabel: { ...chart.axisLabel.value, formatter: (value: number) => number(value, true) },
      // One set of gridlines — a second would imply the scales share a unit.
      splitLine: { show: false },
      axisLine: { show: false },
    },
  ],
  series: [
    {
      name: t('dash_metric_revenue'),
      type: 'line',
      yAxisIndex: REVENUE_Y_AXIS,
      smooth: 0.35,
      showSymbol: false,
      data: series.value.revenueMajor,
      itemStyle: { color: chart.seriesColor(0) },
      lineStyle: { width: 3 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: withAlpha(chart.seriesColor(0), 0.25) },
            { offset: 1, color: withAlpha(chart.seriesColor(0), 0) },
          ],
        },
      },
    },
    {
      name: t('dash_metric_active_users'),
      type: 'line',
      yAxisIndex: USERS_Y_AXIS,
      smooth: 0.35,
      showSymbol: false,
      data: series.value.activeUsers,
      itemStyle: { color: chart.seriesColor(2) },
      // A dashed line distinguishes the series without relying on colour,
      // which matters in greyscale and for colour-vision deficiency.
      lineStyle: { width: 2, type: 'dashed' },
    },
  ],
}))

/**
 * Spoken description of the SHAPE, not the title.
 *
 * "Revenue chart" tells a screen-reader user nothing a sighted user does not
 * already get from the heading. The trend is the information.
 */
const summary = computed(() => {
  if (points.value.length < 2) return ''
  const first = points.value[0]!
  const last = points.value.at(-1)!
  const change = first.revenue === 0 ? 0 : ((last.revenue - first.revenue) / first.revenue) * 100
  return t('dash_revenue_trend_summary', {
    days: points.value.length,
    direction: t(change >= 0 ? 'dash_trend_up' : 'dash_trend_down'),
    change: Math.abs(change).toFixed(1),
    latest: currency(last.revenue, currencyCode.value),
  })
})

const dataColumns = computed(() => [
  t('common_date'),
  t('dash_metric_revenue'),
  t('dash_metric_active_users'),
])

const dataRows = computed(() =>
  points.value.map((point) => ({
    label: date(point.date, { day: 'numeric', month: 'short', year: 'numeric' }),
    values: [currency(point.revenue, currencyCode.value), number(point.activeUsers)],
  })),
)
</script>

<template>
  <UiPanel
    :title="t('dash_revenue_trend_title')"
    :description="t('dash_revenue_trend_desc')"
    :loading="loading"
    :error="error"
    :updating="updating"
    :empty="isEmpty"
    content-class="min-h-80"
    @retry="emit('retry')"
  >
    <BaseChart
      :option="option"
      height="h-72"
      :summary="summary"
      :data-columns="dataColumns"
      :data-rows="dataRows"
      :data-caption="t('dash_revenue_trend_title')"
    />
  </UiPanel>
</template>
