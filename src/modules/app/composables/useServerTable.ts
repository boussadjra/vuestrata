import type { ColumnDef, TableState } from '@vueye-table/core'
import { computed, watch, type MaybeRefOrGetter, type Ref } from 'vue'

import type { CollectionFilters, PageMeta } from '~/lib/api/collection-queries'

import { useDataTable, type UseDataTableOptions } from './useDataTable'
import type { ListRouteState } from './useListRouteState'

export interface ServerCollection<T> {
  items: Ref<T[]>
  meta: Ref<PageMeta | null>
  isPending: Ref<boolean>
  isFetching: Ref<boolean>
  isError: Ref<boolean>
  refetch: () => unknown
}

export interface ServerTableOptions<T, TFilters extends CollectionFilters> {
  columns: MaybeRefOrGetter<readonly ColumnDef<T>[]>
  query: (filters: Ref<TFilters>) => ServerCollection<T>
  queryState: ListRouteState
  rowKey: NonNullable<UseDataTableOptions<T>['rowKey']>
}

/** The URL is committed state; the table owns only local selection and presentation. */
export function useServerTable<T, TFilters extends CollectionFilters = CollectionFilters>(
  options: ServerTableOptions<T, TFilters>,
) {
  const routeState = options.queryState
  const filters = computed(() => {
    const values = routeState.values.value
    return {
      ...values,
      search: values.search || undefined,
      sortBy: values.sortBy || undefined,
      sortOrder: values.sortBy ? values.sortOrder : undefined,
    } as TFilters
  })
  const collection = options.query(filters)
  const controlled = computed(() => {
    const values = routeState.values.value
    const { page, pageSize, search, sortBy, sortOrder, ...domainFilters } = values
    return {
      search: routeState.search.value,
      pagination: { page: routeState.search.value !== search ? 1 : page, pageSize },
      sorting: sortBy ? [{ column: sortBy, direction: sortOrder }] : [],
      filters: domainFilters,
    }
  })
  let previousIntent = controlled.value
  watch(
    controlled,
    (value) => {
      previousIntent = value
    },
    { flush: 'sync' },
  )

  async function changed(next: TableState): Promise<void> {
    const current = previousIntent
    previousIntent = {
      search: next.search,
      pagination: next.pagination,
      sorting: [...next.sorting],
      filters: { ...next.filters },
    }
    if (next.search !== current.search) {
      routeState.setSearch(next.search)
      return
    }
    const previousSort = current.sorting[0]
    const nextSort = next.sorting[0]
    const patch: Record<string, unknown> = {}
    if (
      previousSort?.column !== nextSort?.column ||
      previousSort?.direction !== nextSort?.direction
    ) {
      patch.sortBy = nextSort?.column
      patch.sortOrder = nextSort?.direction ?? 'asc'
      patch.page = 1
    }
    if (next.pagination.pageSize !== current.pagination.pageSize) {
      patch.pageSize = next.pagination.pageSize
      patch.page = 1
    } else if (next.pagination.page !== current.pagination.page && patch.page === undefined) {
      patch.page = next.pagination.page
    }
    for (const key of Object.keys({ ...current.filters, ...next.filters })) {
      if (next.filters[key] !== current.filters[key]) {
        patch[key] = next.filters[key]
        patch.page = 1
      }
    }
    if (Object.keys(patch).length) {
      await routeState.update(patch)
      previousIntent = controlled.value
      result.table.value.setState(controlled.value)
    }
  }

  const result = useDataTable<T>({
    data: collection.items,
    columns: options.columns,
    manual: true,
    rowKey: options.rowKey,
    rowCount: () => collection.meta.value?.total ?? 0,
    state: controlled,
    onStateChange: (next) => {
      void changed(next)
    },
  })

  // A refused navigation or Back/Forward also restores any uncommitted input.
  watch(routeState.search, (search) => result.table.value.setState({ search }))
  // Counts arrive after deep-link decoding. Reapply the committed page after
  // Vueye has received those counts; stale placeholder totals cannot clamp a URL.
  watch(
    [collection.meta, collection.isPending, collection.isFetching, routeState.values],
    () => {
      const meta = collection.meta.value
      if (
        !meta ||
        collection.isPending.value ||
        collection.isFetching.value ||
        collection.isError.value
      )
        return
      const values = routeState.values.value
      const lastPage = Math.max(1, Math.ceil(meta.total / values.pageSize))
      if (values.page > lastPage) {
        void routeState.update({ page: lastPage }, 'replace')
      } else {
        result.table.value.setState(controlled.value)
      }
    },
    { flush: 'post', immediate: true },
  )

  return {
    ...result,
    queryState: routeState,
    filters,
    search: routeState.search,
    items: collection.items,
    meta: collection.meta,
    isPending: collection.isPending,
    isFetching: collection.isFetching,
    isLoading: computed(() => collection.isPending.value || collection.isFetching.value),
    isError: collection.isError,
    refetch: collection.refetch,
  }
}
