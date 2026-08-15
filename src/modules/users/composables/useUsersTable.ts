/**
 * Binds the users data table to the users list query.
 *
 * The users endpoint predates `createCollectionApi`, so it cannot use the
 * generic `useServerTable`; this is the same contract written against
 * `useUsersQuery`. In particular it repeats the one thing that composable
 * exists to get right: the table needs a row count, the count comes from the
 * query, and the query's parameters come from the table.
 *
 * The cycle is broken by owning the filters in a `ref` so the query can be
 * created first and the table can read it directly. The page used to mirror the
 * results into two extra refs inside a `watchEffect` — a second copy of the
 * data whose only job was to be one tick behind the first.
 */
import type { ColumnDef } from '@tanstack/vue-table'

import { useDataTable } from '~/composables/useDataTable'
import type { User } from '~/types'

import type { UserFilters } from '../types'
import { useUsersQuery } from './useUsersQuery'

const DEFAULT_PAGE_SIZE = 5

export function useUsersTable(columns: ColumnDef<User, unknown>[]) {
  const filters = ref<UserFilters>({ page: 1, pageSize: DEFAULT_PAGE_SIZE })

  const query = useUsersQuery(filters)

  const { table, queryState } = useDataTable<User>({
    data: () => query.users.value,
    columns,
    enableFiltering: true,
    enablePagination: true,
    enableRowSelection: true,
    enableColumnVisibility: true,
    pageSize: DEFAULT_PAGE_SIZE,
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    rowCount: () => query.meta.value?.total,
    pageCount: () => query.meta.value?.totalPages,
    getRowId: (row) => row.id,
  })

  watchEffect(() => {
    const roleFilter = queryState.value.columnFilters.find((filter) => filter.id === 'role')?.value
    const primarySort = queryState.value.sorting[0]

    filters.value = {
      page: queryState.value.pagination.page,
      pageSize: queryState.value.pagination.pageSize || DEFAULT_PAGE_SIZE,
      search: queryState.value.globalFilter || undefined,
      role: typeof roleFilter === 'string' ? roleFilter : undefined,
      sortBy: primarySort?.id,
      sortOrder: primarySort?.direction,
    }
  })

  return {
    table,
    queryState,
    filters,
    meta: query.meta,
    // A refetch triggered by a filter change is still a wait for the reader:
    // the grid shows its loading state for both.
    isLoading: computed(() => query.isLoading.value || query.isFetching.value),
    error: query.error,
    refetch: query.refetch,
  }
}
