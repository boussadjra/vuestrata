<script setup lang="ts">
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
import { useTheme } from '@/composables/useTheme'
import { useThemeColors } from '@/composables/useThemeColors'

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

const { isDark } = useTheme()
const { t } = useI18n()
const { primary: cPrimary, secondary: cSecondary, accent: cAccent } = useThemeColors()

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const textColor = computed(() => (isDark.value ? '#94a3b8' : '#64748b'))
const axisLineColor = computed(() => (isDark.value ? '#334155' : '#e2e8f0'))
const splitColor = computed(() => (isDark.value ? '#1e293b' : '#f1f5f9'))
const tooltipBg = computed(() => (isDark.value ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)'))
const tooltipBorder = computed(() => (isDark.value ? '#334155' : '#e2e8f0'))
const tooltipText = computed(() => (isDark.value ? '#f8fafc' : '#0f172a'))

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
const areaLine = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { ...tooltip(), axisPointer: { type: 'cross', label: { backgroundColor: '#64748b' } } },
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
            { offset: 0, color: hexToRgba(cPrimary.value, 0.25) },
            { offset: 1, color: hexToRgba(cPrimary.value, 0) },
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
            { offset: 0, color: hexToRgba(cSecondary.value, 0.15) },
            { offset: 1, color: hexToRgba(cSecondary.value, 0) },
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
            { offset: 0, color: hexToRgba(cAccent.value, 0.18) },
            { offset: 1, color: hexToRgba(cAccent.value, 0) },
          ],
        },
      },
    },
  ],
}))

// === Stacked Bar ===
const stackedBar = computed(() => ({
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
      itemStyle: { color: '#f59e0b' },
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
const donut = computed(() => ({
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
        borderColor: isDark.value ? '#1e293b' : '#fff',
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
        { value: 12, name: 'Social', itemStyle: { color: '#f59e0b' } },
      ],
    },
  ],
}))

// === Radar ===
const radar = computed(() => ({
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
        color: isDark.value
          ? ['rgba(30,41,59,0.4)', 'rgba(30,41,59,0.2)']
          : ['rgba(241,245,249,0.5)', 'rgba(255,255,255,0.5)'],
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
          areaStyle: { color: hexToRgba(cPrimary.value, 0.15) },
          lineStyle: { color: cPrimary.value, width: 2 },
          itemStyle: { color: cPrimary.value },
        },
        {
          value: [70, 85, 75, 80, 65, 70],
          name: 'Last Quarter',
          areaStyle: { color: hexToRgba(cAccent.value, 0.12) },
          lineStyle: { color: cAccent.value, width: 2 },
          itemStyle: { color: cAccent.value },
        },
      ],
    },
  ],
}))

// === Scatter ===
const scatter = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    ...tooltip(),
    formatter: (p: { value: number[] }) =>
      `Price: $${p.value[0]}<br/>Sales: ${p.value[1]}<br/>Rating: ${p.value[2]}`,
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
        shadowColor: hexToRgba(cPrimary.value, 0.3),
      },
    },
  ],
}))

// === Gauge ===
const gaugeValue = ref(73)
const gauge = computed(() => ({
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
      axisLine: { lineStyle: { width: 18, color: [[1, isDark.value ? '#1e293b' : '#e2e8f0']] } },
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
const treemap = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: tooltip('item'),
  series: [
    {
      type: 'treemap',
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      label: { show: true, color: '#fff', fontSize: 12, fontWeight: 600 },
      itemStyle: { borderColor: isDark.value ? '#1e293b' : '#fff', borderWidth: 2, gapWidth: 2 },
      levels: [{ itemStyle: { borderWidth: 0, gapWidth: 3 }, upperLabel: { show: false } }],
      data: [
        { name: 'AWS', value: 4200, itemStyle: { color: cPrimary.value } },
        { name: 'GCP', value: 2800, itemStyle: { color: cAccent.value } },
        { name: 'Azure', value: 1900, itemStyle: { color: '#f59e0b' } },
        { name: 'Vercel', value: 1200, itemStyle: { color: cSecondary.value } },
        { name: 'Cloudflare', value: 900, itemStyle: { color: '#06b6d4' } },
        { name: 'Other', value: 600, itemStyle: { color: '#64748b' } },
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

const heatmap = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    ...tooltip(),
    formatter: (p: { value: number[] }) =>
      `${days[p.value[1]!]} ${hours[p.value[0]!]}: ${p.value[2]} requests`,
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
        color: isDark.value
          ? ['rgba(30,41,59,0.3)', 'transparent']
          : ['rgba(241,245,249,0.5)', 'transparent'],
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
      color: isDark.value
        ? ['#1e293b', hexToRgba(cPrimary.value, 0.5), cPrimary.value]
        : [hexToRgba(cPrimary.value, 0.05), hexToRgba(cPrimary.value, 0.4), cPrimary.value],
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
      <p class="text-surface-500 dark:text-surface-400 mt-1">{{ t('charts_subtitle') }}</p>
    </div>

    <!-- Area Line + Stacked Bar -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 min-w-0 rounded-2xl border bg-white/90 p-5 shadow-sm"
      >
        <BaseChart
          :option="areaLine"
          :title="t('charts_revenue_expenses')"
          :description="t('charts_revenue_expenses_desc')"
        />
      </div>
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 min-w-0 rounded-2xl border bg-white/90 p-5 shadow-sm"
      >
        <BaseChart
          :option="stackedBar"
          :title="t('charts_quarterly')"
          description="Stacked bar chart with product breakdown"
        />
      </div>
    </div>

    <!-- Donut + Radar -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 min-w-0 rounded-2xl border bg-white/90 p-5 shadow-sm"
      >
        <BaseChart
          :option="donut"
          :title="t('charts_traffic')"
          description="Donut chart with emphasis labels"
        />
      </div>
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 min-w-0 rounded-2xl border bg-white/90 p-5 shadow-sm"
      >
        <BaseChart
          :option="radar"
          :title="t('charts_department')"
          description="Radar chart comparing quarters"
        />
      </div>
    </div>

    <!-- Scatter + Gauge -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 min-w-0 rounded-2xl border bg-white/90 p-5 shadow-sm"
      >
        <BaseChart
          :option="scatter"
          :title="t('charts_price_sales')"
          description="Scatter plot with size mapped to rating"
        />
      </div>
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 min-w-0 rounded-2xl border bg-white/90 p-5 shadow-sm"
      >
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
            <span
              class="text-surface-600 dark:text-surface-300 w-10 text-center text-sm font-medium tabular-nums"
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
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 min-w-0 rounded-2xl border bg-white/90 p-5 shadow-sm"
      >
        <BaseChart
          :option="treemap"
          :title="t('charts_infra_costs')"
          description="Treemap showing cloud spend distribution"
        />
      </div>
      <div
        class="dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 min-w-0 rounded-2xl border bg-white/90 p-5 shadow-sm"
      >
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
