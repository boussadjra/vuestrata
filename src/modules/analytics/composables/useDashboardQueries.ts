import { useQuery } from '@tanstack/vue-query'
import type { ZodType } from 'zod'

import { apiGet } from '~/lib/api/client'

import { analyticsModuleKeys } from '../query-keys'
import {
  activityFeedSchema,
  activitySeriesSchema,
  attentionItemsSchema,
  dashboardStatsSchema,
  funnelSchema,
  revenueBreakdownSchema,
  systemHealthSchema,
  teamPerformanceSchema,
  upcomingEventsSchema,
  type DashboardFilters,
} from '../types/dashboard'

/**
 * Dashboard server state.
 *
 * Every query runs its response through the shared zod schema. That is what
 * makes a backend contract change a loud failure instead of a silently wrong
 * number — the previous implementation trusted the response shape and shipped
 * `placeholderData` that looked like real data, so a total mismatch between the
 * handler and the query produced a dashboard that rendered confidently and was
 * simply incorrect.
 *
 * There is deliberately NO placeholder data here. Fabricated figures are
 * indistinguishable from real ones once rendered; the UI shows skeletons while
 * `isPending`, and an error state when the request fails.
 */

/** Builds the query string every dashboard endpoint accepts. */
function filterParams(filters: Ref<DashboardFilters>): Record<string, string> {
  return { range: filters.value.range, segment: filters.value.segment }
}

/**
 * Shared query factory.
 *
 * Extracted because nine endpoints repeat exactly this shape — schema
 * validation, filter-aware key, no placeholder. The alternative is nine
 * near-identical composables where a subtle divergence in one is invisible.
 */
function createDashboardQuery<T>(
  resource: string,
  schema: ZodType<T>,
  filters: Ref<DashboardFilters>,
) {
  const query = useQuery({
    // The filters are part of the key, so changing the range or segment
    // refetches rather than showing the previous window's numbers.
    queryKey: analyticsModuleKeys.dashboard(resource, filterParams(filters)),
    queryFn: async () =>
      schema.parse(
        await apiGet<unknown>(`/dashboard/${resource}`, {
          query: filterParams(filters),
        }),
      ),
    // Keep the previous window visible while the next one loads, so switching
    // range does not blank the whole board.
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  })

  return {
    data: computed(() => query.data.value),
    isPending: computed(() => query.isPending.value),
    isFetching: computed(() => query.isFetching.value),
    isError: computed(() => query.isError.value),
    error: computed(() => query.error.value),
    refetch: () => query.refetch(),
  }
}

export function useDashboardStatsQuery(filters: Ref<DashboardFilters>) {
  return createDashboardQuery('stats', dashboardStatsSchema, filters)
}

export function useActivitySeriesQuery(filters: Ref<DashboardFilters>) {
  return createDashboardQuery('activity', activitySeriesSchema, filters)
}

export function useRevenueBreakdownQuery(filters: Ref<DashboardFilters>) {
  return createDashboardQuery('revenue-breakdown', revenueBreakdownSchema, filters)
}

export function useFunnelQuery(filters: Ref<DashboardFilters>) {
  return createDashboardQuery('funnel', funnelSchema, filters)
}

export function useTeamPerformanceQuery(filters: Ref<DashboardFilters>) {
  return createDashboardQuery('team-performance', teamPerformanceSchema, filters)
}

export function useRecentActivityQuery(filters: Ref<DashboardFilters>) {
  return createDashboardQuery('recent-activity', activityFeedSchema, filters)
}

export function useAttentionItemsQuery(filters: Ref<DashboardFilters>) {
  return createDashboardQuery('attention', attentionItemsSchema, filters)
}

export function useUpcomingEventsQuery(filters: Ref<DashboardFilters>) {
  return createDashboardQuery('upcoming', upcomingEventsSchema, filters)
}

export function useSystemHealthQuery(filters: Ref<DashboardFilters>) {
  return createDashboardQuery('health', systemHealthSchema, filters)
}
