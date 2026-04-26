import { useQuery } from '@tanstack/vue-query'

import { apiGet } from '~/lib/api/client'
import { normalizeError } from '~/lib/errors'
import type { User, PaginatedResponse } from '~/types'

import { usersModuleKeys } from '../query-keys'
import type { UserFilters } from '../types'

/**
 * Query composable — fetches the users list with optional filters.
 */
export function useUsersQuery(filters?: MaybeRef<UserFilters>) {
  const query = useQuery({
    queryKey: computed(() => usersModuleKeys.list(toValue(filters) ?? {})),
    queryFn: () => {
      const f = toValue(filters) ?? {}
      const params = new URLSearchParams()
      if (f.page) params.set('page', String(f.page))
      if (f.pageSize) params.set('pageSize', String(f.pageSize))
      if (f.search) params.set('search', f.search)
      if (f.role) params.set('role', f.role)
      return apiGet<PaginatedResponse<User>>(`/users?${params.toString()}`)
    },
  })

  const users = computed(() => query.data.value?.data ?? [])
  const meta = computed(() => query.data.value?.meta ?? null)
  const isLoading = computed(() => query.isLoading.value)
  const error = computed(() => {
    const e = query.error.value
    return e ? normalizeError(e).message : null
  })

  return {
    users,
    meta,
    isLoading,
    error,
    refetch: () => query.refetch(),
  }
}
