/**
 * Binds `useDataTable` to a server-backed collection.
 *
 * Two jobs, and the second is why this exists as a composable rather than
 * something each page wires by hand.
 *
 * 1. Translate table state into query parameters. Doing that per page is where
 *    the drift starts: one page sends `sort`, another `sortBy`, a third forgets
 *    to reset to page 1 when the search term changes and leaves the user
 *    staring at an empty page 6.
 *
 * 2. Get the initialisation order right, once. The table needs a row count, the
 *    count comes from the query, the query needs filters, and the filters come
 *    from the table. Written literally in a page that is a temporal dead zone —
 *    `useDataTable` evaluates its `rowCount` getter during setup and reads a
 *    `const` declared below it, and the page dies with "Cannot access 'meta'
 *    before initialization". Type-checks perfectly; crashes on load.
 *
 *    The cycle is broken by owning the filters in a ref, so the collection can
 *    be created FIRST and the table can read it directly. An earlier attempt
 *    mirrored the results into intermediate refs instead; the table then
 *    rendered an empty body while the footer cheerfully reported 48 rows,
 *    because the mirror and the props were reading two different sources.
 *    Reading one source removes the whole class of problem.
 */
import type { ColumnDef } from '@tanstack/vue-table'
import type { MaybeRefOrGetter, Ref } from 'vue'

import type { CollectionFilters, PageMeta } from '~/lib/api/collection-queries'

import { useDataTable } from './useDataTable'

/** The shape `createCollectionApi(...).useList` returns. */
export interface ServerCollection<T> {
  items: Ref<T[]>
  meta: Ref<PageMeta | null>
  isPending: Ref<boolean>
  isFetching: Ref<boolean>
  isError: Ref<boolean>
  refetch: () => void
}

export interface ServerTableOptions<T, TFilters extends CollectionFilters> {
  columns: MaybeRefOrGetter<ColumnDef<T, unknown>[]>
  /** Runs the list query. A factory called once during setup, not a fetch. */
  query: (filters: Ref<TFilters>) => ServerCollection<T>
  /** Domain filters (status, category, …) merged into every request. */
  extra?: () => Record<string, string | number | undefined>
  /** Milliseconds to wait before a search keystroke becomes a request. */
  searchDebounceMs?: number
  pageSize?: number
  getRowId?: (row: T) => string
}

function defaultRowId<T>(row: T, index: number): string {
  if (typeof row === 'object' && row !== null && 'id' in row) {
    const id = (row as { id: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') return String(id)
  }

  return String(index)
}

export function useServerTable<T, TFilters extends CollectionFilters = CollectionFilters>(
  options: ServerTableOptions<T, TFilters>,
) {
  const { query, extra, searchDebounceMs = 300, pageSize = 10, getRowId } = options

  // Owned here, so the collection can exist before the table does.
  const filters = ref({ page: 1, pageSize }) as Ref<TFilters>

  const collection = query(filters)

  // The table reads the collection directly — one source of truth for both the
  // rows and the counts, so the body and the footer cannot disagree.
  const { table, queryState } = useDataTable<T>({
    data: () => collection.items.value,
    columns: () => toValue(options.columns),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageSize,
    rowCount: () => collection.meta.value?.total,
    pageCount: () => collection.meta.value?.totalPages,
    getRowId: getRowId ? (row: T) => getRowId(row) : defaultRowId,
  })

  // Debounced separately from the rest of the state: sorting and paging should
  // fire immediately (the user has committed to them), whereas every keystroke
  // of a search term should not become a request.
  const search = ref('')
  watchDebounced(
    () => queryState.value.globalFilter,
    (value) => {
      search.value = value
    },
    { debounce: searchDebounceMs },
  )

  // Feed table state back into the filters the query watches. `flush: 'sync'`
  // is deliberately NOT used: a paging click should produce one request after
  // the state settles, not one per intermediate value.
  watchEffect(() => {
    const sort = queryState.value.sorting[0]
    filters.value = {
      page: queryState.value.pagination.page,
      pageSize: queryState.value.pagination.pageSize || pageSize,
      search: search.value || undefined,
      sortBy: sort?.id,
      sortOrder: sort?.direction,
      ...extra?.(),
    } as TFilters
  })

  const isLoading = computed(() => collection.isPending.value || collection.isFetching.value)

  return {
    table,
    queryState,
    filters,
    search,
    items: collection.items,
    meta: collection.meta,
    isPending: collection.isPending,
    isFetching: collection.isFetching,
    isLoading,
    isError: collection.isError,
    refetch: collection.refetch,
  }
}
