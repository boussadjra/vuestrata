<script setup lang="ts">
import type { EChartsOption } from 'echarts'

import { UiPanel } from '@/components/ui'
import BaseChart from '@/components/ui/BaseChart.vue'
import { useFormatters } from '@/composables/useFormatters'

import { useChartColors } from '../composables/useChartColors'
import { useDashboardI18n } from '../composables/useDashboardI18n'
import { revenueSourceLabel } from '../lib/dashboard-labels'
import type { RevenueBreakdown } from '../types/dashboard'

const props = defineProps<{
  data: RevenueBreakdown | undefined
  loading: boolean
  error: boolean
  updating?: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const { dt } = useDashboardI18n()
const { currency, percent } = useFormatters()
const chart = useChartColors()

const segments = computed(() => props.data?.segments ?? [])
const isEmpty = computed(() => segments.value.length === 0)

function sourceLabel(segment: { key: string; label: string }): string {
  return revenueSourceLabel(segment.key, segment.label)
}

const option = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'item', ...chart.tooltip.value },
  // The share list below is the legend. A second ECharts legend would
  // repeat names and colours without the numbers that make the split readable.
  legend: { show: false },
  series: [
    {
      type: 'pie',
      radius: ['52%', '78%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: chart.pieItemBorder.value,
      label: { show: false },
      emphasis: { label: { show: false } },
      data: segments.value.map((segment, index) => ({
        name: sourceLabel(segment),
        value: segment.amount,
        itemStyle: { color: chart.seriesColor(index) },
      })),
    },
  ],
}))

const summary = computed(() => {
  const largest = [...segments.value].sort((a, b) => b.share - a.share)[0]
  if (!largest) return ''
  return dt('dash_revenue_split_summary', {
    segment: sourceLabel(largest),
    share: percent(largest.share),
    count: segments.value.length,
  })
})

const dataColumns = computed(() => [
  dt('dash_segment_label'),
  dt('common_amount'),
  dt('common_share'),
])

const dataRows = computed(() =>
  segments.value.map((segment) => ({
    label: sourceLabel(segment),
    values: [currency(segment.amount, props.data?.currency ?? 'USD'), percent(segment.share)],
  })),
)
</script>

<template>
  <UiPanel
    :title="dt('dash_revenue_split_title')"
    :description="dt('dash_revenue_split_desc')"
    :loading="loading"
    :error="error"
    :updating="updating"
    :empty="isEmpty"
    content-class="min-h-80"
    @retry="emit('retry')"
  >
    <BaseChart
      :option="option"
      height="h-56"
      :summary="summary"
      :data-columns="dataColumns"
      :data-rows="dataRows"
      :data-caption="dt('dash_revenue_split_title')"
    >
      <!--
        The only legend. Segment sizes are hard to compare by eye; this list
        carries the shares. Hidden from assistive technology because the
        fallback table already has label, amount, and share.
      -->
      <ul class="mt-2 space-y-1.5" aria-hidden="true">
        <li
          v-for="(segment, index) in segments"
          :key="segment.key"
          class="flex items-center gap-2 text-sm"
        >
          <span
            class="h-2.5 w-2.5 shrink-0 rounded-full"
            :style="{ backgroundColor: chart.seriesColor(index) }"
          />
          <span class="text-foreground min-w-0 flex-1 leading-snug">{{
            sourceLabel(segment)
          }}</span>
          <span class="text-muted-foreground tabular-nums">{{ percent(segment.share) }}</span>
        </li>
      </ul>
    </BaseChart>
  </UiPanel>
</template>
