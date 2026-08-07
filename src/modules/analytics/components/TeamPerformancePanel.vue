<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { useI18n } from 'vue-i18n'

import { UiPanel } from '@/components/ui'
import BaseChart from '@/components/ui/BaseChart.vue'
import { useFormatters } from '@/composables/useFormatters'

import { useChartColors } from '../composables/useChartColors'
import type { TeamPerformance } from '../types/dashboard'

const props = defineProps<{
  data: TeamPerformance | undefined
  loading: boolean
  error: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()
const { number, percent } = useFormatters()
const chart = useChartColors()

const teams = computed(() => props.data?.teams ?? [])
const isEmpty = computed(() => teams.value.length === 0)

const option = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...chart.tooltip.value },
  grid: { left: '2%', right: '4%', bottom: '3%', top: '8%', containLabel: true },
  xAxis: {
    type: 'value',
    max: 100,
    axisLabel: { ...chart.axisLabel.value, formatter: '{value}%' },
    splitLine: chart.splitLine.value,
  },
  yAxis: {
    type: 'category',
    // Highest last so the longest bar sits at the top of a horizontal chart.
    data: [...teams.value].map((team) => team.name).reverse(),
    axisLabel: chart.axisLabel.value,
    axisTick: { show: false },
    axisLine: chart.axisLine.value,
  },
  series: [
    {
      name: t('dash_team_efficiency'),
      type: 'bar',
      barWidth: 14,
      data: [...teams.value].reverse().map((team, index) => ({
        value: team.efficiency,
        itemStyle: { color: chart.seriesColor(teams.value.length - 1 - index), borderRadius: 7 },
      })),
    },
  ],
}))

const summary = computed(() => {
  if (teams.value.length === 0) return ''
  const sorted = [...teams.value].sort((a, b) => b.efficiency - a.efficiency)
  const best = sorted[0]!
  const worst = sorted.at(-1)!
  return t('dash_team_summary', {
    best: best.name,
    bestValue: percent(best.efficiency),
    worst: worst.name,
    worstValue: percent(worst.efficiency),
  })
})

const dataColumns = computed(() => [
  t('dash_team_label'),
  t('dash_team_completed'),
  t('dash_team_efficiency'),
])

const dataRows = computed(() =>
  teams.value.map((team) => ({
    label: team.name,
    values: [`${number(team.completed)} / ${number(team.total)}`, percent(team.efficiency)],
  })),
)
</script>

<template>
  <UiPanel
    :title="t('dash_team_title')"
    :description="t('dash_team_desc')"
    :loading="loading"
    :error="error"
    :empty="isEmpty"
    content-class="min-h-64"
    @retry="emit('retry')"
  >
    <BaseChart
      :option="option"
      height="h-56"
      :summary="summary"
      :data-columns="dataColumns"
      :data-rows="dataRows"
      :data-caption="t('dash_team_title')"
    />
  </UiPanel>
</template>
