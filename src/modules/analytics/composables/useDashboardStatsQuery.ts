import { useQuery } from '@tanstack/vue-query'

import { apiGet } from '~/lib/api/client'

import { analyticsModuleKeys } from '../query-keys'

export interface DashboardStats {
  totalUsers: number
  activeProjects: number
  revenue: string
  satisfaction: string
  // 7-day trend arrays (most-recent last). TODO: wire from real API.
  revenueTrend: number[]
  usersTrend: number[]
  projectsTrend: number[]
  satisfactionTrend: number[]
}

const fallbackStats: DashboardStats = {
  totalUsers: 8432,
  activeProjects: 142,
  revenue: '$45,231',
  satisfaction: '98%',
  revenueTrend: [38, 42, 35, 50, 47, 56, 61],
  usersTrend: [7100, 7380, 7560, 7820, 8050, 8210, 8432],
  projectsTrend: [118, 124, 128, 133, 136, 139, 142],
  satisfactionTrend: [94, 96, 95, 97, 97, 98, 98],
}

/**
 * Query composable — fetches dashboard overview stats.
 */
export function useDashboardStatsQuery() {
  const query = useQuery({
    queryKey: analyticsModuleKeys.stats(),
    queryFn: () => apiGet<DashboardStats>('/dashboard/stats'),
    placeholderData: fallbackStats,
  })

  const stats = computed(() => query.data.value ?? fallbackStats)
  const isLoading = computed(() => query.isLoading.value)

  return {
    stats,
    isLoading,
    refetch: () => query.refetch(),
  }
}
