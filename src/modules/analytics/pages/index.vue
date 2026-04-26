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
import { useTheme } from '@/composables/useTheme'
import { resolveIcon } from '@/config/icon-provider'
import { useAuthStore } from '@/stores/auth'
import type { IconName } from '@/types'

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
const { currentTheme, isDark } = useTheme()

const { stats, isLoading: loading } = useDashboardStatsQuery()

const statCards = computed(() => {
  const s = stats.value
  return [
    {
      label: 'dash_users',
      value: (s.totalUsers ?? 0).toLocaleString(),
      iconName: 'users' as IconName,
      tone: 'text-primary-500 bg-primary-100 dark:bg-primary-900/40',
    },
    {
      label: 'dash_projects',
      value: String(s.activeProjects ?? 0),
      iconName: 'folder' as IconName,
      tone: 'text-accent-500 bg-accent-100 dark:bg-accent-900/40',
    },
    {
      label: 'dash_revenue',
      value: s.revenue ?? '—',
      iconName: 'dollar' as IconName,
      tone: 'text-secondary-500 bg-secondary-100 dark:bg-secondary-900/40',
    },
    {
      label: 'dash_satisfaction',
      value: s.satisfaction ?? '—',
      iconName: 'emoji' as IconName,
      tone: 'text-primary-600 bg-primary-100 dark:bg-primary-900/40',
    },
  ]
})

const themeLabel = computed(() => t('theme_default'))

const chartOptionsMain = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    backgroundColor: isDark.value ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
    borderColor: isDark.value ? '#334155' : '#e2e8f0',
    textStyle: { color: isDark.value ? '#f8fafc' : '#0f172a' },
    borderRadius: 8,
    padding: [12, 16],
    axisPointer: { type: 'cross', label: { backgroundColor: '#64748b' } },
  },
  grid: { left: '2%', right: '3%', bottom: '4%', top: '14%', containLabel: true },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    axisLabel: { color: isDark.value ? '#94a3b8' : '#64748b', margin: 16 },
    axisTick: { show: false },
    axisLine: { lineStyle: { color: isDark.value ? '#334155' : '#e2e8f0' } },
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: isDark.value ? '#94a3b8' : '#64748b', margin: 16 },
    splitLine: { lineStyle: { color: isDark.value ? '#1e293b' : '#f1f5f9', type: 'dashed' } },
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
      itemStyle: { color: '#14b8a6' }, // primary-500
      lineStyle: { width: 3 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            {
              offset: 0,
              color: 'rgba(20, 184, 166, 0.3)',
            },
            {
              offset: 1,
              color: 'rgba(20, 184, 166, 0.01)',
            },
          ],
        },
      },
    },
    {
      name: 'Users',
      type: 'line',
      smooth: 0.4,
      symbolSize: 8,
      data: [220, 182, 191, 234, 290, 330, 310],
      itemStyle: { color: '#10b981' }, // accent-500
      lineStyle: { width: 3 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            {
              offset: 0,
              color: 'rgba(16, 185, 129, 0.3)',
            },
            {
              offset: 1,
              color: 'rgba(16, 185, 129, 0.01)',
            },
          ],
        },
      },
    },
  ],
}))

const chartOptionsBars = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    backgroundColor: isDark.value ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.95)',
    borderColor: isDark.value ? '#334155' : '#e2e8f0',
    textStyle: { color: isDark.value ? '#f8fafc' : '#0f172a' },
  },
  grid: { left: '2%', right: '3%', bottom: '1%', top: '15%', containLabel: true },
  xAxis: {
    type: 'category',
    data: ['Design', 'Dev', 'QA', 'Docs', 'Ops'],
    axisLabel: { color: isDark.value ? '#94a3b8' : '#64748b' },
    axisTick: { show: false },
    axisLine: { show: false },
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: isDark.value ? '#94a3b8' : '#64748b' },
    splitLine: { lineStyle: { color: isDark.value ? '#1e293b' : '#f1f5f9', type: 'dashed' } },
  },
  series: [
    {
      type: 'bar',
      barWidth: 16,
      data: [88, 72, 61, 54, 47],
      itemStyle: {
        borderRadius: [8, 8, 0, 0],
        color: '#14b8a6',
      },
      emphasis: {
        itemStyle: { color: '#0d9488' },
      },
    },
  ],
}))

const chartOptionsPie = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'item',
    backgroundColor: isDark.value ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
    borderColor: isDark.value ? '#334155' : '#e2e8f0',
    textStyle: { color: isDark.value ? '#f8fafc' : '#0f172a' },
    borderRadius: 8,
    padding: [12, 16],
  },
  legend: {
    top: '5%',
    left: 'center',
    textStyle: { color: isDark.value ? '#94a3b8' : '#64748b' },
    itemWidth: 10,
    itemHeight: 10,
    icon: 'circle',
  },
  series: [
    {
      name: 'Sources',
      type: 'pie',
      radius: ['55%', '80%'],
      center: ['50%', '60%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 12,
        borderColor: isDark.value ? '#1e293b' : '#fff',
        borderWidth: 3,
      },
      label: { show: false, position: 'center' },
      emphasis: {
        label: {
          show: true,
          fontSize: 24,
          fontWeight: 'bold',
          color: isDark.value ? '#f8fafc' : '#0f172a',
          formatter: '{b}\n{d}%',
        },
      },
      labelLine: { show: false },
      data: [
        { value: 1048, name: 'Search', itemStyle: { color: '#14b8a6' } }, // primary
        { value: 735, name: 'Direct', itemStyle: { color: '#f59e0b' } }, // secondary
        { value: 580, name: 'Email', itemStyle: { color: '#10b981' } }, // accent
        { value: 484, name: 'Ads', itemStyle: { color: '#f59e0b' } },
        { value: 300, name: 'Video', itemStyle: { color: '#06b6d4' } },
      ],
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
            class="btn from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 shadow-primary-500/25 flex items-center gap-2 rounded-xl bg-linear-to-r px-5 py-2.5 font-medium text-white shadow-lg transition-all active:scale-95"
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

      <div v-else class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="(stat, index) in statCards"
          :key="stat.label"
          class="card group dark:bg-surface-800/90 border-surface-200 dark:border-surface-700 hover:shadow-elevated relative transform overflow-hidden rounded-2xl border bg-white/90 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1"
          :style="{ animationDelay: `${index * 85}ms`, animationFillMode: 'both' }"
          :class="'animate-slide-up'"
        >
          <div class="relative z-10 mb-4 flex items-center justify-between">
            <span
              class="text-surface-500 dark:text-surface-400 text-sm font-semibold tracking-wide uppercase"
              >{{ t(stat.label) }}</span
            >
            <div
              :class="[
                stat.tone,
                'flex items-center justify-center rounded-xl p-2.5 transition-transform duration-300 group-hover:scale-110',
              ]"
            >
              <span :class="[resolveIcon(stat.iconName), 'h-6 w-6']" />
            </div>
          </div>
          <p class="text-surface-900 relative z-10 text-3xl font-black md:text-4xl dark:text-white">
            {{ stat.value }}
          </p>
          <div class="relative z-10 mt-4 flex items-center gap-2">
            <div
              class="text-accent-600 dark:text-accent-400 bg-accent-50 dark:bg-accent-900/30 flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold"
            >
              <span :class="[resolveIcon('trend-up'), 'h-3 w-3']" />
              12.5%
            </div>
            <span class="text-surface-400 text-xs font-medium">{{ t('dash_vs_last_month') }}</span>
          </div>

          <div
            class="from-primary-400 to-secondary-500 pointer-events-none absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-linear-to-tr opacity-[0.05] transition-transform duration-500 group-hover:scale-150 dark:opacity-[0.12]"
          />
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
              class="text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg p-2 transition-colors"
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
              class="text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg p-2 transition-colors"
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
    radial-gradient(circle at 10% 10%, rgb(20 184 166 / 0.14), transparent 35%),
    radial-gradient(circle at 85% 20%, rgb(245 158 11 / 0.12), transparent 40%),
    radial-gradient(circle at 30% 80%, rgb(16 185 129 / 0.1), transparent 38%);
}

.dashboard-glow {
  pointer-events: none;
  position: absolute;
  border-radius: 9999px;
  opacity: 0.6;
  animation: float-orb 10s ease-in-out infinite;
}

.dashboard-glow-1 {
  width: 22rem;
  height: 22rem;
  left: -7rem;
  top: -7rem;
  background: rgb(20 184 166 / 0.34);
}

.dashboard-glow-2 {
  width: 24rem;
  height: 24rem;
  right: -7rem;
  top: 28%;
  background: rgb(245 158 11 / 0.24);
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
