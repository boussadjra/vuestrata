import { useQuery } from '@tanstack/vue-query'

import { apiGet } from '~/lib/api/client'

import { analyticsModuleKeys } from '../query-keys'

export interface DashboardStats {
  totalUsers: number
  activeProjects: number
  revenue: string
  satisfaction: string
}

const fallbackStats: DashboardStats = {
  totalUsers: 8432,
  activeProjects: 142,
  revenue: '$45,231',
  satisfaction: '98%',
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
