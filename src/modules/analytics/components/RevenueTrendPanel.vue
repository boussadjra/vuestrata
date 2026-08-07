<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { useI18n } from 'vue-i18n'

import { UiPanel } from '@/components/ui'
import BaseChart from '@/components/ui/BaseChart.vue'
import { useFormatters } from '@/composables/useFormatters'

import { useChartColors, withAlpha } from '../composables/useChartColors'
import type { ActivitySeries } from '../types/dashboard'

const props = defineProps<{
  data: ActivitySeries | undefined
  loading: boolean
  error: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()
const { currency, number, date } = useFormatters()
const chart = useChartColors()

const points = computed(() => props.data?.points ?? [])
const isEmpty = computed(() => points.value.length === 0)

const labels = computed(() => points.value.map((point) => date(point.date)))

const option = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis', ...chart.tooltip.value },
  legend: { top: 0, ...chart.legend.value },
  grid: { left: '2%', right: '3%', bottom: '3%', top: '18%', containLabel: true },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: labels.value,
    axisLabel: chart.axisLabel.value,
    axisTick: { show: false },
    axisLine: chart.axisLine.value,
  },
  yAxis: [
    {
      type: 'value',
      axisLabel: { ...chart.axisLabel.value, formatter: (value: number) => number(value, true) },
      splitLine: chart.splitLine.value,
      axisLine: { show: false },
    },
  ],
  series: [
    {
      name: t('dash_metric_revenue'),
      type: 'line',
      smooth: 0.35,
      showSymbol: false,
      data: points.value.map((point) => point.revenue),
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
      smooth: 0.35,
      showSymbol: false,
      data: points.value.map((point) => point.activeUsers),
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
    latest: currency(last.revenue, props.data?.currency ?? 'USD'),
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
    values: [currency(point.revenue, props.data?.currency ?? 'USD'), number(point.activeUsers)],
  })),
)
</script>

<template>
  <UiPanel
    :title="t('dash_revenue_trend_title')"
    :description="t('dash_revenue_trend_desc')"
    :loading="loading"
    :error="error"
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
