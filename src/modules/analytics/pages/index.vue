<script setup lang="ts">
import { UiPageHeader } from '@/components/ui'
import { useAuthStore } from '@/stores/auth'

import ConversionFunnelPanel from '../components/ConversionFunnelPanel.vue'
import DashboardFilterBar from '../components/DashboardFilterBar.vue'
import DashboardKpiRow from '../components/DashboardKpiRow.vue'
import NeedsAttentionPanel from '../components/NeedsAttentionPanel.vue'
import QuickActionsPanel from '../components/QuickActionsPanel.vue'
import RecentActivityPanel from '../components/RecentActivityPanel.vue'
import RevenueBreakdownPanel from '../components/RevenueBreakdownPanel.vue'
import RevenueTrendPanel from '../components/RevenueTrendPanel.vue'
import SystemHealthPanel from '../components/SystemHealthPanel.vue'
import TeamPerformancePanel from '../components/TeamPerformancePanel.vue'
import UpcomingEventsPanel from '../components/UpcomingEventsPanel.vue'
import { useDashboardI18n } from '../composables/useDashboardI18n'
import {
  useActivitySeriesQuery,
  useAttentionItemsQuery,
  useDashboardStatsQuery,
  useFunnelQuery,
  useRecentActivityQuery,
  useRevenueBreakdownQuery,
  useSystemHealthQuery,
  useTeamPerformanceQuery,
  useUpcomingEventsQuery,
} from '../composables/useDashboardQueries'
import type { DashboardFilters } from '../types/dashboard'

const { dt } = useDashboardI18n()
const authStore = useAuthStore()

/**
 * One filter state drives every panel.
 *
 * The filters are part of each query key, so changing the range or segment
 * refetches the whole board together — panels never end up showing figures
 * from different windows side by side under the same heading.
 */
const filters = ref<DashboardFilters>({ range: '7d', segment: 'all' })

const stats = useDashboardStatsQuery(filters)
const activity = useActivitySeriesQuery(filters)
const breakdown = useRevenueBreakdownQuery(filters)
const funnel = useFunnelQuery(filters)
const team = useTeamPerformanceQuery(filters)
const recent = useRecentActivityQuery(filters)
const attention = useAttentionItemsQuery(filters)
const upcoming = useUpcomingEventsQuery(filters)
const health = useSystemHealthQuery(filters)

const greeting = computed(() =>
  authStore.user?.name
    ? dt('dash_welcome_named', { name: authStore.user.name })
    : dt('dash_welcome'),
)
</script>

<template>
  <div class="mx-auto max-w-7xl min-w-0 space-y-6">
    <UiPageHeader :title="dt('sidebar_dashboard')" :description="greeting">
      <template #actions>
        <DashboardFilterBar v-model="filters" />
      </template>
    </UiPageHeader>

    <DashboardKpiRow
      :data="stats.data.value"
      :loading="stats.isPending.value"
      :error="stats.isError.value"
      :updating="stats.isFetching.value"
      @retry="stats.refetch()"
    />

    <!--
      A 12-column grid: proportional widths on desktop, a clean single-column
      stack on mobile.

      Every panel owns its own loading, empty and error state rather than the
      page gating everything behind one flag — one slow or failing endpoint
      should degrade its own card, not blank the whole board.
    -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
      <div class="lg:col-span-8">
        <RevenueTrendPanel
          :data="activity.data.value"
          :loading="activity.isPending.value"
          :error="activity.isError.value"
          :updating="activity.isFetching.value"
          @retry="activity.refetch()"
        />
      </div>
      <div class="lg:col-span-4">
        <RevenueBreakdownPanel
          :data="breakdown.data.value"
          :loading="breakdown.isPending.value"
          :error="breakdown.isError.value"
          :updating="breakdown.isFetching.value"
          @retry="breakdown.refetch()"
        />
      </div>

      <div class="lg:col-span-6">
        <ConversionFunnelPanel
          :data="funnel.data.value"
          :loading="funnel.isPending.value"
          :error="funnel.isError.value"
          :updating="funnel.isFetching.value"
          @retry="funnel.refetch()"
        />
      </div>
      <div class="lg:col-span-6">
        <TeamPerformancePanel
          :data="team.data.value"
          :loading="team.isPending.value"
          :error="team.isError.value"
          :updating="team.isFetching.value"
          @retry="team.refetch()"
        />
      </div>

      <div class="lg:col-span-7">
        <RecentActivityPanel
          :data="recent.data.value"
          :loading="recent.isPending.value"
          :error="recent.isError.value"
          :updating="recent.isFetching.value"
          @retry="recent.refetch()"
        />
      </div>
      <div class="lg:col-span-5">
        <NeedsAttentionPanel
          :data="attention.data.value"
          :loading="attention.isPending.value"
          :error="attention.isError.value"
          :updating="attention.isFetching.value"
          @retry="attention.refetch()"
        />
      </div>

      <div class="lg:col-span-4">
        <UpcomingEventsPanel
          :data="upcoming.data.value"
          :loading="upcoming.isPending.value"
          :error="upcoming.isError.value"
          :updating="upcoming.isFetching.value"
          @retry="upcoming.refetch()"
        />
      </div>
      <div class="lg:col-span-4">
        <SystemHealthPanel
          :data="health.data.value"
          :loading="health.isPending.value"
          :error="health.isError.value"
          :updating="health.isFetching.value"
          @retry="health.refetch()"
        />
      </div>
      <div class="lg:col-span-4">
        <QuickActionsPanel />
      </div>
    </div>
  </div>
</template>
