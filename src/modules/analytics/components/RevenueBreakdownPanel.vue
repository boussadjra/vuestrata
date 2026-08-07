<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { useI18n } from 'vue-i18n'

import { UiPanel } from '@/components/ui'
import BaseChart from '@/components/ui/BaseChart.vue'
import { useFormatters } from '@/composables/useFormatters'

import { useChartColors } from '../composables/useChartColors'
import type { RevenueBreakdown } from '../types/dashboard'

const props = defineProps<{
  data: RevenueBreakdown | undefined
  loading: boolean
  error: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()
const { currency, percent } = useFormatters()
const chart = useChartColors()

const segments = computed(() => props.data?.segments ?? [])
const isEmpty = computed(() => segments.value.length === 0)

const option = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'item', ...chart.tooltip.value },
  legend: { bottom: 0, ...chart.legend.value },
  series: [
    {
      type: 'pie',
      radius: ['52%', '78%'],
      center: ['50%', '44%'],
      avoidLabelOverlap: false,
      itemStyle: chart.pieItemBorder.value,
      label: { show: false },
      emphasis: { label: { show: false } },
      data: segments.value.map((segment, index) => ({
        name: segment.label,
        value: segment.amount,
        itemStyle: { color: chart.seriesColor(index) },
      })),
    },
  ],
}))

const summary = computed(() => {
  const largest = [...segments.value].sort((a, b) => b.share - a.share)[0]
  if (!largest) return ''
  return t('dash_revenue_split_summary', {
    segment: largest.label,
    share: percent(largest.share),
    count: segments.value.length,
  })
})

const dataColumns = computed(() => [t('dash_segment_label'), t('common_amount'), t('common_share')])

const dataRows = computed(() =>
  segments.value.map((segment) => ({
    label: segment.label,
    values: [currency(segment.amount, props.data?.currency ?? 'USD'), percent(segment.share)],
  })),
)
</script>

<template>
  <UiPanel
    :title="t('dash_revenue_split_title')"
    :description="t('dash_revenue_split_desc')"
    :loading="loading"
    :error="error"
    :empty="isEmpty"
    content-class="min-h-80"
    @retry="emit('retry')"
  >
    <BaseChart
      :option="option"
      height="h-64"
      :summary="summary"
      :data-columns="dataColumns"
      :data-rows="dataRows"
      :data-caption="t('dash_revenue_split_title')"
    />

    <!--
      A visible legend with the numbers, not just the donut.
      Segment sizes are hard to compare by eye, and the chart's own legend
      carries only colour swatches and names.
    -->
    <ul class="mt-2 space-y-1.5">
      <li
        v-for="(segment, index) in segments"
        :key="segment.key"
        class="flex items-center gap-2 text-sm"
      >
        <span
          class="h-2.5 w-2.5 shrink-0 rounded-full"
          :style="{ backgroundColor: chart.seriesColor(index) }"
          aria-hidden="true"
        />
        <span class="text-foreground min-w-0 flex-1 truncate">{{ segment.label }}</span>
        <span class="text-muted-foreground tabular-nums">{{ percent(segment.share) }}</span>
      </li>
    </ul>
  </UiPanel>
</template>
