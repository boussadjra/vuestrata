<script setup lang="ts">
import BaseChart from '@/components/ui/BaseChart.vue'

import type { buildGalleryChart } from '../lib/chart-gallery'
import { registerGalleryCharts } from '../lib/register-gallery-charts'

defineProps<{
  chart: ReturnType<typeof buildGalleryChart>
  title: string
  description: string
  dataExpanded: boolean
}>()

// Loaded by the first gallery card entering the viewport, keeping the larger
// registration set outside the entry-page import graph.
registerGalleryCharts()
</script>

<template>
  <BaseChart
    :option="chart.option"
    :summary="`${title}. ${description}`"
    :data-caption="title"
    :data-columns="chart.dataColumns"
    :data-rows="dataExpanded ? undefined : chart.dataRows"
    height="h-80"
  />
</template>
