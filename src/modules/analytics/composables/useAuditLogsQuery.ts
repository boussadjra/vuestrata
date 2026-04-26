import { useQuery, keepPreviousData } from '@tanstack/vue-query'

import { apiGet } from '~/lib/api/client'
import type { AuditLogEntry, PaginatedResponse } from '~/types'

import { analyticsModuleKeys } from '../query-keys'

export interface AuditLogFilters {
  page?: number
  limit?: number
  action?: string
}

/**
 * Query composable — fetches paginated audit log entries.
 */
export function useAuditLogsQuery(filters?: MaybeRef<AuditLogFilters>) {
  const query = useQuery({
    queryKey: computed(() =>
      analyticsModuleKeys.auditLogs(toValue(filters) as Record<string, unknown> | undefined),
    ),
    queryFn: () => {
      const f = toValue(filters) ?? {}
      const params = new URLSearchParams()
      params.set('page', String(f.page ?? 1))
      params.set('limit', String(f.limit ?? 10))
      if (f.action) params.set('action', f.action)
      return apiGet<PaginatedResponse<AuditLogEntry>>(`/audit-logs?${params}`)
    },
    placeholderData: keepPreviousData,
  })

  const entries = computed(() => query.data.value?.data ?? [])
  const totalPages = computed(() => query.data.value?.meta?.totalPages ?? 1)
  const total = computed(() => query.data.value?.meta?.total ?? 0)
  const isLoading = computed(() => query.isLoading.value)

  return {
    entries,
    totalPages,
    total,
    isLoading,
    refetch: () => query.refetch(),
  }
}
