import type { ColumnDef } from '@vueye-table/core'
import type { MaybeRefOrGetter } from 'vue'

import type { ListRouteState } from '~/composables/useListRouteState'
import { useServerTable } from '~/composables/useServerTable'
import type { User } from '~/types'

import type { UserFilters } from '../types'
import { useUsersQuery } from './useUsersQuery'

/** The older users response is adapted once to the shared collection shape. */
export function useUsersTable(
  columns: MaybeRefOrGetter<readonly ColumnDef<User>[]>,
  queryState: ListRouteState,
) {
  let query: ReturnType<typeof useUsersQuery>
  const result = useServerTable<User, UserFilters>({
    columns,
    queryState,
    rowKey: 'id',
    query: (filters) => {
      query = useUsersQuery(filters)
      return {
        items: query.users,
        meta: query.meta,
        isPending: query.isLoading,
        isFetching: query.isFetching,
        isError: computed(() => query.error.value !== null),
        refetch: query.refetch,
      }
    },
  })
  return { ...result, error: computed(() => query.error.value) }
}
