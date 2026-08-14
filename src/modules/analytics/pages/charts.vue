<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import {
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  RadarChart,
  GaugeChart,
  TreemapChart,
  HeatmapChart,
} from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  VisualMapComponent,
  CalendarComponent,
  RadarComponent,
  TitleComponent,
} from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useI18n } from 'vue-i18n'

import BaseChart from '@/components/ui/BaseChart.vue'

import { useChartColors, withAlpha } from '../composables/useChartColors'

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  RadarChart,
  GaugeChart,
  TreemapChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  VisualMapComponent,
  CalendarComponent,
  RadarComponent,
  TitleComponent,
])

const { t } = useI18n()
// Series colours come from the categorical chart tokens, so every chart on
// this page draws from one palette that is separable in greyscale and flips
// with dark mode. See styles/semantic.css.
const { seriesColor } = useChartColors()
const cPrimary = computed(() => seriesColor(0))
const cSecondary = computed(() => seriesColor(4))
const cAccent = computed(() => seriesColor(1))
const cTertiary = computed(() => seriesColor(2))

/*
 * Chart chrome — axis labels, gridlines, tooltip surface.
 *
 * These used to be `isDark ? '#94a3b8' : '#64748b'` pairs: the DEFAULT theme's
 * slate ramp, written as literals. A canvas cannot use CSS classes, so a
 * hardcoded literal here is not "a fallback" — it is the only value the chart
 * will ever draw, on all ten themes. Every axis on this page rendered in
 * Tailwind slate whether the app was set to Blueprint, Ghibli or Terminal,
 * which is most of what "the theme isn't applied on the charts page" was.
 *
 * `useThemeColors` resolves the same semantic tokens the rest of the app uses
 * and re-reads them on every theme and colour-mode change.
 */
const { foreground, mutedForeground, border, elevated } = useThemeColors()
const textColor = mutedForeground
const axisLineColor = border
const splitColor = border
const tooltipBg = elevated
const tooltipBorder = border
const tooltipText = foreground

function tooltip(trigger: 'axis' | 'item' = 'axis') {
  return {
    trigger,
    backgroundColor: tooltipBg.value,
    borderColor: tooltipBorder.value,
    textStyle: { color: tooltipText.value },
    borderRadius: 8,
    padding: [10, 14],
  }
}

// === Area / Line ===
const areaLine = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    ...tooltip(),
    axisPointer: { type: 'cross', label: { backgroundColor: mutedForeground.value } },
  },
  legend: { top: 0, textStyle: { color: textColor.value } },
  grid: { left: '2%', right: '3%', bottom: '3%', top: '14%', containLabel: true },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    axisLabel: { color: textColor.value },
    axisTick: { show: false },
    axisLine: { lineStyle: { color: axisLineColor.value } },
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: textColor.value },
    splitLine: { lineStyle: { color: splitColor.value, type: 'dashed' } },
    axisLine: { show: false },
    axisTick: { show: false },
  },
  series: [
    {
      name: 'Revenue',
      type: 'line',
      smooth: 0.4,
      data: [4200, 3800, 5100, 4800, 6100, 7200, 6800, 7500, 8400, 8900, 9200, 10100],
      itemStyle: { color: cPrimary.value },
      lineStyle: { width: 3 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: withAlpha(cPrimary.value, 0.25) },
            { offset: 1, color: withAlpha(cPrimary.value, 0) },
          ],
        },
      },
    },
    {
      name: 'Expenses',
      type: 'line',
      smooth: 0.4,
      data: [3100, 2900, 3400, 3200, 3800, 4200, 4100, 4500, 4700, 4600, 5000, 5400],
      itemStyle: { color: cSecondary.value },
      lineStyle: { width: 3 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: withAlpha(cSecondary.value, 0.15) },
            { offset: 1, color: withAlpha(cSecondary.value, 0) },
          ],
        },
      },
    },
    {
      name: 'Profit',
      type: 'line',
      smooth: 0.4,
      data: [1100, 900, 1700, 1600, 2300, 3000, 2700, 3000, 3700, 4300, 4200, 4700],
      itemStyle: { color: cAccent.value },
      lineStyle: { width: 3 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: withAlpha(cAccent.value, 0.18) },
            { offset: 1, color: withAlpha(cAccent.value, 0) },
          ],
        },
      },
    },
  ],
}))

// === Stacked Bar ===
const stackedBar = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  tooltip: { ...tooltip(), axisPointer: { type: 'shadow' } },
  legend: { top: 0, textStyle: { color: textColor.value } },
  grid: { left: '2%', right: '3%', bottom: '3%', top: '14%', containLabel: true },
  xAxis: {
    type: 'category',
    data: ['Q1', 'Q2', 'Q3', 'Q4'],
    axisLabel: { color: textColor.value },
    axisTick: { show: false },
    axisLine: { lineStyle: { color: axisLineColor.value } },
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: textColor.value },
    splitLine: { lineStyle: { color: splitColor.value, type: 'dashed' } },
  },
  series: [
    {
      name: 'Product A',
      type: 'bar',
      stack: 'total',
      barWidth: 30,
      data: [320, 302, 341, 374],
      itemStyle: { color: cPrimary.value, borderRadius: [0, 0, 0, 0] },
    },
    {
      name: 'Product B',
      type: 'bar',
      stack: 'total',
      data: [220, 188, 231, 250],
      itemStyle: { color: cAccent.value },
    },
    {
      name: 'Product C',
      type: 'bar',
      stack: 'total',
      data: [150, 212, 261, 200],
      // Slot 3, not a literal amber. The literal collided with slot 5 on any
      // theme whose fifth chart token is the warning ramp — two identical
      // series in one legend.
      itemStyle: { color: cTertiary.value },
    },
    {
      name: 'Services',
      type: 'bar',
      stack: 'total',
      data: [98, 130, 155, 180],
      itemStyle: { color: cSecondary.value, borderRadius: [6, 6, 0, 0] },
    },
  ],
}))

// === Donut / Pie ===
const donut = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  tooltip: tooltip('item'),
  legend: {
    bottom: 0,
    textStyle: { color: textColor.value },
    icon: 'circle',
    itemWidth: 10,
    itemHeight: 10,
  },
  series: [
    {
      type: 'pie',
      radius: ['50%', '78%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        // The separator is the CARD surface cutting between segments, which is
        // what keeps a donut readable when two slices are close in hue.
        borderColor: elevated.value,
        borderWidth: 3,
      },
      label: { show: false },
      emphasis: {
        label: {
          show: true,
          fontSize: 22,
          fontWeight: 'bold',
          color: tooltipText.value,
          formatter: '{b}\n{d}%',
        },
      },
      data: [
        { value: 42, name: 'Organic', itemStyle: { color: cPrimary.value } },
        { value: 28, name: 'Paid', itemStyle: { color: cSecondary.value } },
        { value: 18, name: 'Referral', itemStyle: { color: cAccent.value } },
        { value: 12, name: 'Social', itemStyle: { color: cTertiary.value } },
      ],
    },
  ],
}))

// === Radar ===
const radar = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  tooltip: tooltip('item'),
  legend: { top: 0, textStyle: { color: textColor.value } },
  radar: {
    indicator: [
      { name: 'Sales', max: 100 },
      { name: 'Marketing', max: 100 },
      { name: 'Tech', max: 100 },
      { name: 'Support', max: 100 },
      { name: 'Finance', max: 100 },
      { name: 'HR', max: 100 },
    ],
    shape: 'circle',
    axisName: { color: textColor.value },
    splitArea: {
      areaStyle: {
        color: [withAlpha(border.value, 0.5), withAlpha(border.value, 0.22)],
      },
    },
    splitLine: { lineStyle: { color: splitColor.value } },
    axisLine: { lineStyle: { color: splitColor.value } },
  },
  series: [
    {
      type: 'radar',
      data: [
        {
          value: [85, 72, 91, 68, 78, 82],
          name: 'This Quarter',
          areaStyle: { color: withAlpha(cPrimary.value, 0.15) },
          lineStyle: { color: cPrimary.value, width: 2 },
          itemStyle: { color: cPrimary.value },
        },
        {
          value: [70, 85, 75, 80, 65, 70],
          name: 'Last Quarter',
          areaStyle: { color: withAlpha(cAccent.value, 0.12) },
          lineStyle: { color: cAccent.value, width: 2 },
          itemStyle: { color: cAccent.value },
        },
      ],
    },
  ],
}))

// === Scatter ===
const scatter = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    ...tooltip(),
    formatter: (p) => {
      const value = !Array.isArray(p) && Array.isArray(p.value) ? p.value : []
      return `Price: $${value[0] ?? '—'}<br/>Sales: ${value[1] ?? '—'}<br/>Rating: ${value[2] ?? '—'}`
    },
  },
  grid: { left: '3%', right: '5%', bottom: '5%', top: '8%', containLabel: true },
  xAxis: {
    name: 'Price ($)',
    nameLocation: 'center',
    nameGap: 30,
    axisLabel: { color: textColor.value },
    splitLine: { lineStyle: { color: splitColor.value, type: 'dashed' } },
  },
  yAxis: {
    name: 'Sales',
    nameLocation: 'center',
    nameGap: 40,
    axisLabel: { color: textColor.value },
    splitLine: { lineStyle: { color: splitColor.value, type: 'dashed' } },
  },
  series: [
    {
      type: 'scatter',
      symbolSize: (val: number[]) => val[2]! * 4,
      data: [
        [28, 400, 8],
        [45, 320, 12],
        [110, 220, 15],
        [65, 290, 10],
        [140, 180, 18],
        [33, 350, 9],
        [78, 260, 14],
        [200, 120, 20],
        [52, 310, 11],
        [92, 240, 16],
        [160, 150, 19],
        [42, 330, 10],
        [120, 200, 17],
        [70, 270, 13],
        [180, 130, 21],
      ],
      itemStyle: {
        color: cPrimary.value,
        shadowBlur: 10,
        shadowColor: withAlpha(cPrimary.value, 0.3),
      },
    },
  ],
}))

// === Gauge ===
const gaugeValue = ref(73)
const gauge = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  series: [
    {
      type: 'gauge',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: 100,
      splitNumber: 10,
      itemStyle: { color: cPrimary.value },
      progress: { show: true, width: 18 },
      pointer: { show: false },
      axisLine: { lineStyle: { width: 18, color: [[1, border.value]] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      title: { offsetCenter: [0, '-15%'], color: textColor.value, fontSize: 14 },
      detail: {
        valueAnimation: true,
        offsetCenter: [0, '10%'],
        fontSize: 36,
        fontWeight: 'bold',
        formatter: '{value}%',
        color: tooltipText.value,
      },
      data: [{ value: gaugeValue.value, name: 'System Health' }],
    },
  ],
}))

// === Treemap ===
const treemap = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  tooltip: tooltip('item'),
  series: [
    {
      type: 'treemap',
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      // `elevated`, not white. Treemap labels sit ON the series fill, and the
      // series tokens are the ramp's DARK steps in light mode and its LIGHT
      // steps in dark mode — so a fixed white label is legible in one mode and
      // invisible in the other. `elevated` inverts with them.
      label: { show: true, color: elevated.value, fontSize: 12, fontWeight: 600 },
      itemStyle: { borderColor: elevated.value, borderWidth: 2, gapWidth: 2 },
      levels: [{ itemStyle: { borderWidth: 0, gapWidth: 3 }, upperLabel: { show: false } }],
      data: [
        { name: 'AWS', value: 4200, itemStyle: { color: cPrimary.value } },
        { name: 'GCP', value: 2800, itemStyle: { color: cAccent.value } },
        { name: 'Azure', value: 1900, itemStyle: { color: cTertiary.value } },
        { name: 'Vercel', value: 1200, itemStyle: { color: cSecondary.value } },
        { name: 'Cloudflare', value: 900, itemStyle: { color: seriesColor(5) } },
        { name: 'Other', value: 600, itemStyle: { color: seriesColor(7) } },
      ],
    },
  ],
}))

// === Heatmap ===
const hours = [
  '12am',
  '2am',
  '4am',
  '6am',
  '8am',
  '10am',
  '12pm',
  '2pm',
  '4pm',
  '6pm',
  '8pm',
  '10pm',
]
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const heatmapData: number[][] = []
for (let d = 0; d < 7; d++) {
  for (let h = 0; h < 12; h++) {
    const peak = h >= 4 && h <= 9 && d >= 1 && d <= 5 ? 80 : 20
    heatmapData.push([h, d, Math.round(Math.random() * peak + (peak === 80 ? 20 : 0))])
  }
}

const heatmap = computed<EChartsOption>(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    ...tooltip(),
    formatter: (p) => {
      const value = !Array.isArray(p) && Array.isArray(p.value) ? p.value : []
      const hourIndex = typeof value[0] === 'number' ? value[0] : 0
      const dayIndex = typeof value[1] === 'number' ? value[1] : 0
      const requests = typeof value[2] === 'number' ? value[2] : 0
      return `${days[dayIndex] ?? '—'} ${hours[hourIndex] ?? '—'}: ${requests} requests`
    },
  },
  grid: { left: '10%', right: '6%', bottom: '12%', top: '4%' },
  xAxis: {
    type: 'category',
    data: hours,
    axisLabel: { color: textColor.value },
    axisTick: { show: false },
    axisLine: { lineStyle: { color: axisLineColor.value } },
    splitArea: {
      show: true,
      areaStyle: {
        color: [withAlpha(border.value, 0.4), 'transparent'],
      },
    },
  },
  yAxis: {
    type: 'category',
    data: days,
    axisLabel: { color: textColor.value },
    axisTick: { show: false },
    axisLine: { lineStyle: { color: axisLineColor.value } },
  },
  visualMap: {
    min: 0,
    max: 100,
    calculable: true,
    orient: 'horizontal',
    left: 'center',
    bottom: 0,
    inRange: {
      // Three stops of one hue at increasing alpha. Alpha composites over the
      // card in either colour mode, so this needs no light/dark branch — the
      // branch it replaced pinned the dark low end to Tailwind slate-800.
      color: [withAlpha(cPrimary.value, 0.08), withAlpha(cPrimary.value, 0.45), cPrimary.value],
    },
    textStyle: { color: textColor.value },
  },
  series: [
    {
      type: 'heatmap',
      data: heatmapData,
      label: { show: false },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.4)' } },
    },
  ],
}))
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <div>
      <h1 class="text-surface-900 text-3xl font-extrabold tracking-tight dark:text-white">
        {{ t('charts_title') }}
      </h1>
      <p class="text-muted-foreground mt-1">{{ t('charts_subtitle') }}</p>
    </div>

    <!-- Area Line + Stacked Bar -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="card min-w-0 p-5">
        <BaseChart
          :option="areaLine"
          :title="t('charts_revenue_expenses')"
          :description="t('charts_revenue_expenses_desc')"
        />
      </div>
      <div class="card min-w-0 p-5">
        <BaseChart
          :option="stackedBar"
          :title="t('charts_quarterly')"
          description="Stacked bar chart with product breakdown"
        />
      </div>
    </div>

    <!-- Donut + Radar -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="card min-w-0 p-5">
        <BaseChart
          :option="donut"
          :title="t('charts_traffic')"
          description="Donut chart with emphasis labels"
        />
      </div>
      <div class="card min-w-0 p-5">
        <BaseChart
          :option="radar"
          :title="t('charts_department')"
          description="Radar chart comparing quarters"
        />
      </div>
    </div>

    <!-- Scatter + Gauge -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="card min-w-0 p-5">
        <BaseChart
          :option="scatter"
          :title="t('charts_price_sales')"
          description="Scatter plot with size mapped to rating"
        />
      </div>
      <div class="card min-w-0 p-5">
        <BaseChart
          :option="gauge"
          :title="t('charts_system_health')"
          description="Animated gauge with progress ring"
        >
          <div class="mt-2 flex items-center justify-center gap-3">
            <button
              class="bg-surface-100 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 rounded-lg px-3 py-1 text-sm transition-colors"
              @click="gaugeValue = Math.max(0, gaugeValue - 10)"
            >
              -10
            </button>
            <span class="text-muted-foreground w-10 text-center text-sm font-medium tabular-nums"
              >{{ gaugeValue }}%</span
            >
            <button
              class="bg-surface-100 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 rounded-lg px-3 py-1 text-sm transition-colors"
              @click="gaugeValue = Math.min(100, gaugeValue + 10)"
            >
              +10
            </button>
          </div>
        </BaseChart>
      </div>
    </div>

    <!-- Treemap + Heatmap -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="card min-w-0 p-5">
        <BaseChart
          :option="treemap"
          :title="t('charts_infra_costs')"
          description="Treemap showing cloud spend distribution"
        />
      </div>
      <div class="card min-w-0 p-5">
        <BaseChart
          :option="heatmap"
          :title="t('charts_heatmap')"
          description="Hourly request volume by day of week"
          height="h-80"
        />
      </div>
    </div>
  </div>
</template>
