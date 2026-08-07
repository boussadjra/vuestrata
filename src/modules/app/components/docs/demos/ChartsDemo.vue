<script setup lang="ts">
import type { EChartsOption } from 'echarts'

const option: EChartsOption = {
  tooltip: { trigger: 'axis' },
  grid: { left: 24, right: 18, top: 24, bottom: 24, containLabel: true },
  xAxis: {
    type: 'category',
    data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    boundaryGap: false,
  },
  yAxis: {
    type: 'value',
    splitLine: { lineStyle: { opacity: 0.2 } },
  },
  series: [
    {
      name: 'Revenue',
      type: 'line',
      smooth: true,
      areaStyle: { opacity: 0.12 },
      data: [42, 58, 54, 72, 68, 81],
    },
  ],
}
</script>

<template>
  <UiCard>
    <template #header>
      <div>
        <h3 class="text-surface-900 text-lg font-bold dark:text-white">Chart preview</h3>
        <p class="text-muted-foreground mt-1 text-sm">
          Live ECharts rendering through the shared `BaseChart` wrapper.
        </p>
      </div>
    </template>

    <BaseChart :option="option" height="h-80" />
  </UiCard>
</template>
