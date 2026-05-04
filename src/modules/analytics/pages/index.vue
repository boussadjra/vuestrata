<script setup lang="ts">
import { LineChart, PieChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
} from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useI18n } from 'vue-i18n'

import BaseChart from '@/components/ui/BaseChart.vue'
import { resolveIcon } from '@/config/icon-provider'
import { useAuthStore } from '@/stores/auth'

import { useChartColors } from '../composables/useChartColors'
import { useDashboardStatsQuery } from '../composables/useDashboardStatsQuery'

use([
  CanvasRenderer,
  LineChart,
  PieChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
])

const { t } = useI18n()
const authStore = useAuthStore()
const chart = useChartColors()

const { stats, isLoading: loading } = useDashboardStatsQuery()

const themeLabel = computed(() => t('theme_default'))

function makeSparkline(data: number[], color: string) {
  return {
    backgroundColor: 'transparent',
    animation: false,
    grid: { top: 2, bottom: 2, left: 2, right: 2 },
    xAxis: { type: 'category' as const, show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value' as const, show: false, scale: true },
    series: [
      {
        type: 'line',
        data,
        smooth: 0.4,
        symbol: 'none',
        lineStyle: { width: 1.5, color },
      },
    ],
  }
}

const metricStrip = computed(() => {
  const s = stats.value
  return [
    {
      key: 'revenue',
      label: t('dash_revenue'),
      value: s.revenue ?? '—',
      spark: makeSparkline(s.revenueTrend ?? [], chart.sparkPalette.value.revenue),
    },
    {
      key: 'users',
      label: t('dash_users'),
      value: (s.totalUsers ?? 0).toLocaleString(),
      spark: makeSparkline(s.usersTrend ?? [], chart.sparkPalette.value.users),
    },
    {
      key: 'projects',
      label: t('dash_projects'),
      value: String(s.activeProjects ?? 0),
      spark: makeSparkline(s.projectsTrend ?? [], chart.sparkPalette.value.projects),
    },
    {
      key: 'satisfaction',
      label: t('dash_satisfaction'),
      value: s.satisfaction ?? '—',
      spark: makeSparkline(s.satisfactionTrend ?? [], chart.sparkPalette.value.satisfaction),
    },
  ]
})

const chartOptionsMain = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    ...chart.tooltip.value,
    axisPointer: { type: 'cross', label: chart.axisPointerLabel.value },
  },
  grid: { left: '2%', right: '3%', bottom: '4%', top: '14%', containLabel: true },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    axisLabel: { ...chart.axisLabel.value, margin: 16 },
    axisTick: { show: false },
    axisLine: chart.axisLine.value,
  },
  yAxis: {
    type: 'value',
    axisLabel: { ...chart.axisLabel.value, margin: 16 },
    splitLine: chart.splitLine.value,
    axisLine: { show: false },
    axisTick: { show: false },
  },
  series: [
    {
      name: 'Revenue',
      type: 'line',
      smooth: 0.4,
      symbolSize: 8,
      data: [120, 132, 101, 134, 90, 230, 210],
      itemStyle: { color: chart.palette.value[0] },
      lineStyle: { width: 3 },
      areaStyle: { color: chart.palette.value[0], opacity: 0.08 },
    },
    {
      name: 'Users',
      type: 'line',
      smooth: 0.4,
      symbolSize: 8,
      data: [220, 182, 191, 234, 290, 330, 310],
      itemStyle: { color: chart.palette.value[1] },
      lineStyle: { width: 3 },
      areaStyle: { color: chart.palette.value[1], opacity: 0.08 },
    },
  ],
}))

const chartOptionsBars = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...chart.tooltip.value },
  grid: { left: '2%', right: '3%', bottom: '1%', top: '15%', containLabel: true },
  xAxis: {
    type: 'category',
    data: ['Design', 'Dev', 'QA', 'Docs', 'Ops'],
    axisLabel: chart.axisLabel.value,
    axisTick: { show: false },
    axisLine: { show: false },
  },
  yAxis: {
    type: 'value',
    axisLabel: chart.axisLabel.value,
    splitLine: chart.splitLine.value,
  },
  series: [
    {
      type: 'bar',
      barWidth: 16,
      data: [88, 72, 61, 54, 47],
      itemStyle: {
        borderRadius: [8, 8, 0, 0],
        color: chart.palette.value[0],
      },
      emphasis: {
        itemStyle: { color: chart.palette.value[0] },
      },
    },
  ],
}))

const chartOptionsPie = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'item', ...chart.tooltip.value },
  legend: { top: '5%', left: 'center', ...chart.legend.value },
  series: [
    {
      name: 'Sources',
      type: 'pie',
      radius: ['55%', '80%'],
      center: ['50%', '60%'],
      avoidLabelOverlap: false,
      itemStyle: chart.pieItemBorder.value,
      label: { show: false, position: 'center' },
      emphasis: {
        label: {
          show: true,
          fontSize: 24,
          fontWeight: 'bold',
          color: chart.tooltip.value.textStyle.color,
          formatter: '{b}\n{d}%',
        },
      },
      labelLine: { show: false },
      data: chart.palette.value.map((color, i) => ({
        value: [1048, 735, 580, 484, 300][i],
        name: ['Search', 'Direct', 'Email', 'Ads', 'Video'][i],
        itemStyle: { color },
      })),
    },
  ],
}))
</script>

<template>
  <section class="dashboard-stage animate-fade-in">
    <div class="dashboard-glow dashboard-glow-1" />
    <div class="dashboard-glow dashboard-glow-2" />

    <div
      class="dark:text-surface-50 relative z-10 mx-auto min-h-screen max-w-7xl space-y-8 p-4 md:p-6 lg:p-8"
    >
      <div
        class="animate-slide-down flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
      >
        <div>
          <h1
            class="text-surface-900 text-3xl font-extrabold tracking-tight md:text-4xl dark:text-white"
          >
            {{ t('sidebar_dashboard') }}
          </h1>
          <p v-if="authStore.user" class="text-surface-500 dark:text-surface-400 mt-2 text-lg">
            {{ t('home_welcome') }},
            <span class="text-primary-600 dark:text-primary-400 font-semibold">{{
              authStore.user.name
            }}</span>
          </p>
          <p
            class="dark:bg-surface-800/95 dark:border-surface-700 text-surface-500 dark:text-surface-300 mt-2 inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/95 px-3 py-1 text-xs font-semibold"
          >
            <span :class="[resolveIcon('palette-round'), 'text-secondary-500 h-4 w-4']" />
            {{ themeLabel }}
          </p>
        </div>
        <div class="flex gap-3">
          <button
            class="btn bg-primary-500 hover:bg-primary-600 shadow-primary-500/20 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 flex items-center gap-2 rounded-xl px-5 py-2.5 font-medium text-white shadow-md transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95"
          >
            <span :class="[resolveIcon('document-add'), 'h-5 w-5']" />
            {{ t('dash_new_report') }}
          </button>
        </div>
      </div>

      <div v-if="loading" class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="i in 4"
          :key="i"
          class="card dark:bg-surface-800 h-36 animate-pulse rounded-2xl border-none bg-white shadow-sm"
        />
      </div>

      <!--
        Metric strip: one surface, varied slot weighting.
        Revenue is the primary anchor (flex-[2]); the other three are supporting (flex-[1]).
        Sparklines provide directional context without decorative hero-metric framing.
      -->
      <div
        class="border-surface-200 dark:border-surface-700 dark:bg-surface-900/60 animate-slide-up overflow-hidden rounded-2xl border bg-white/80 shadow-sm"
      >
        <!-- Loading skeleton -->
        <div
          v-if="loading"
          class="divide-surface-200 dark:divide-surface-700 flex animate-pulse divide-x"
        >
          <div class="bg-surface-100 dark:bg-surface-800 h-24 flex-2" />
          <div v-for="i in 3" :key="i" class="bg-surface-100 dark:bg-surface-800 h-24 flex-1" />
        </div>
        <!-- Loaded strip -->
        <div
          v-else
          class="divide-surface-200 dark:divide-surface-700 flex flex-col sm:flex-row sm:divide-x"
        >
          <!-- Primary slot: Revenue (flex-[2]) -->
          <div
            class="border-surface-200 dark:border-surface-700 flex-2 border-b px-6 py-5 sm:border-b-0"
          >
            <p class="text-surface-500 dark:text-surface-400 mb-1 text-xs font-medium">
              {{ metricStrip[0]!.label }}
            </p>
            <p
              class="text-surface-900 dark:text-surface-50 text-2xl font-semibold tracking-tight tabular-nums"
            >
              {{ metricStrip[0]!.value }}
            </p>
            <BaseChart :option="metricStrip[0]!.spark" height="h-7" class="mt-2" />
          </div>
          <!-- Supporting slots (flex-1 each) -->
          <div
            v-for="(m, i) in metricStrip.slice(1)"
            :key="m.key"
            class="flex-1 px-5 py-5"
            :class="
              i < 2 ? 'border-surface-200 dark:border-surface-700 border-b sm:border-b-0' : ''
            "
          >
            <p class="text-surface-500 dark:text-surface-400 mb-1 text-xs font-medium">
              {{ m.label }}
            </p>
            <p
              class="text-surface-900 dark:text-surface-50 text-lg font-semibold tracking-tight tabular-nums"
            >
              {{ m.value }}
            </p>
            <BaseChart :option="m.spark" height="h-5" class="mt-2" />
          </div>
        </div>
      </div>

      <div
        class="animate-slide-up grid grid-cols-1 gap-6 lg:grid-cols-12"
        style="animation-delay: 300ms; animation-fill-mode: both"
      >
        <div
          class="card dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 hover:shadow-elevated group min-w-0 rounded-2xl border bg-white/90 p-6 shadow-sm transition-all duration-300 lg:col-span-8"
        >
          <div class="mb-6 flex items-center justify-between">
            <div>
              <h2
                class="text-surface-900 group-hover:text-primary-500 text-xl font-bold transition-colors dark:text-white"
              >
                {{ t('dash_revenue_users') }}
              </h2>
              <p class="text-surface-500 dark:text-surface-400 text-sm">
                {{ t('dash_weekly_metrics') }}
              </p>
            </div>
            <button
              class="text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 rounded-lg p-3 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              :aria-label="t('dash_chart_options', 'Chart options')"
            >
              <span :class="[resolveIcon('dots-menu'), 'block h-5 w-5']" />
            </button>
          </div>
          <BaseChart :option="chartOptionsMain" :loading="loading" height="h-80" />
        </div>

        <div
          class="card dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 hover:shadow-elevated group min-w-0 rounded-2xl border bg-white/90 p-6 shadow-sm transition-all duration-300 lg:col-span-4"
        >
          <div class="mb-6 flex items-center justify-between">
            <div>
              <h2
                class="text-surface-900 group-hover:text-secondary-500 text-xl font-bold transition-colors dark:text-white"
              >
                {{ t('dash_traffic_sources') }}
              </h2>
              <p class="text-surface-500 dark:text-surface-400 text-sm">
                {{ t('dash_visitor_channels') }}
              </p>
            </div>
            <button
              class="text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 focus-visible:ring-primary-300/30 dark:focus-visible:ring-offset-surface-900 rounded-lg p-3 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              :aria-label="t('dash_chart_options', 'Chart options')"
            >
              <span :class="[resolveIcon('dots-menu'), 'block h-5 w-5']" />
            </button>
          </div>
          <BaseChart :option="chartOptionsPie" :loading="loading" height="h-80" />
        </div>
      </div>

      <div
        class="card dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 hover:shadow-elevated animate-slide-up rounded-2xl border bg-white/90 p-6 shadow-sm transition-all duration-300"
        style="animation-delay: 460ms; animation-fill-mode: both"
      >
        <div class="mb-4 flex items-center justify-between">
          <h2 class="text-surface-900 text-xl font-bold dark:text-white">
            {{ t('dash_team_capacity') }}
          </h2>
          <span
            class="bg-secondary-100 dark:bg-secondary-900/40 text-secondary-600 dark:text-secondary-300 rounded-full px-3 py-1 text-xs font-bold"
            >{{ t('dash_sprint') }} 18</span
          >
        </div>
        <BaseChart :option="chartOptionsBars" :loading="loading" height="h-55" />
        <p class="text-surface-500 dark:text-surface-400 mt-4 text-sm">
          {{ t('dash_balanced_workload') }}
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dashboard-stage {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(
      circle at 10% 10%,
      color-mix(in oklch, var(--color-primary-500) 10%, transparent),
      transparent 35%
    ),
    radial-gradient(
      circle at 85% 20%,
      color-mix(in oklch, var(--color-secondary-500) 8%, transparent),
      transparent 40%
    ),
    radial-gradient(
      circle at 30% 80%,
      color-mix(in oklch, var(--color-accent-500) 6%, transparent),
      transparent 38%
    );
}

.dashboard-glow {
  pointer-events: none;
  position: absolute;
  border-radius: 9999px;
  opacity: 0.6;
  will-change: transform;
  contain: layout style;
  animation: float-orb 10s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-glow {
    animation: none;
  }
}

.dashboard-glow-1 {
  width: 22rem;
  height: 22rem;
  left: -7rem;
  top: -7rem;
  background: color-mix(in oklch, var(--color-primary-500) 34%, transparent);
}

.dashboard-glow-2 {
  width: 24rem;
  height: 24rem;
  right: -7rem;
  top: 28%;
  background: color-mix(in oklch, var(--color-secondary-500) 24%, transparent);
  animation-delay: 1.5s;
}

@keyframes float-orb {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  50% {
    transform: translate3d(0, -16px, 0) scale(1.06);
  }
}
</style>
