import {
  useVueTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  createColumnHelper,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type ExpandedState,
  type PaginationState,
  type RowSelectionState,
  type GroupingState,
  type Row,
  type RowData,
} from '@tanstack/vue-table'

export { createColumnHelper }
export { createColumns } from './table-columns'
export type { ColumnChrome, ColumnFilterSpec } from './table-columns'
export type {
  ColumnDef,
  Row,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
  ExpandedState,
  GroupingState,
  PaginationState,
  RowSelectionState,
}

export interface DataTableSortQuery {
  id: string
  desc: boolean
  direction: 'asc' | 'desc'
}

export interface DataTableColumnFilterQuery {
  id: string
  value: unknown
}

export interface DataTableFilterOption {
  label: string
  value: string | number | boolean
}

export type DataTableFilterVariant = 'text' | 'select' | 'boolean'

export interface DataTableColumnMeta {
  label?: string
  align?: 'start' | 'center' | 'end'
  width?: string
  filter?: {
    variant: DataTableFilterVariant
    placeholder?: string
    options?: DataTableFilterOption[]
  }
}

export interface DataTableQueryState {
  globalFilter: string
  sorting: DataTableSortQuery[]
  columnFilters: DataTableColumnFilterQuery[]
  pagination: PaginationState & {
    page: number
  }
  grouping: string[]
}

declare module '@tanstack/table-core' {
  interface ColumnMeta<TData extends RowData, TValue> extends DataTableColumnMeta {}
}

export interface UseDataTableOptions<T> {
  data: T[] | (() => T[])
  columns: MaybeRefOrGetter<ColumnDef<T, unknown>[]>
  enableSorting?: boolean
  enableFiltering?: boolean
  enablePagination?: boolean
  enableRowSelection?: boolean
  enableColumnVisibility?: boolean
  enableGrouping?: boolean
  enableExpanding?: boolean
  pageSize?: number
  rowCount?: MaybeRefOrGetter<number | undefined>
  manualPagination?: boolean
  manualSorting?: boolean
  manualFiltering?: boolean
  pageCount?: MaybeRefOrGetter<number | undefined>
  getRowId?: (originalRow: T, index: number, parent?: Row<T>) => string
  getSubRows?: (originalRow: T, index: number) => T[] | undefined
  getRowCanExpand?: (row: Row<T>) => boolean
  globalFilterFn?: (row: Row<T>, columnId: string, filterValue: string) => boolean
}

export function useDataTable<T>(options: UseDataTableOptions<T>) {
  const {
    enableSorting = true,
    enableFiltering = true,
    enablePagination = true,
    enableRowSelection = false,
    enableColumnVisibility = false,
    enableGrouping = false,
    enableExpanding = false,
    pageSize = 10,
    rowCount,
    manualPagination = false,
    manualSorting = false,
    manualFiltering = false,
    pageCount,
    getRowId,
    getSubRows,
    getRowCanExpand,
  } = options

  const data = typeof options.data === 'function' ? computed(options.data) : ref(options.data)
  const resolvedColumns = computed(() => toValue(options.columns))
  const resolvedRowCount = computed(() => toValue(rowCount))
  const resolvedPageCount = computed(() => toValue(pageCount))

  const sorting = ref<SortingState>([])
  const columnFilters = ref<ColumnFiltersState>([])
  const globalFilter = ref('')
  const columnVisibility = ref<VisibilityState>({})
  const rowSelection = ref<RowSelectionState>({})
  const expanded = ref<ExpandedState>({})
  const grouping = ref<GroupingState>([])
  const pagination = ref<PaginationState>({
    pageIndex: 0,
    pageSize,
  })

  const table = useVueTable({
    get data() {
      return data.value as T[]
    },
    get columns() {
      return resolvedColumns.value
    },
    state: {
      get sorting() {
        return sorting.value
      },
      get columnFilters() {
        return columnFilters.value
      },
      get globalFilter() {
        return globalFilter.value
      },
      get columnVisibility() {
        return columnVisibility.value
      },
      get rowSelection() {
        return rowSelection.value
      },
      get expanded() {
        return expanded.value
      },
      get grouping() {
        return grouping.value
      },
      get pagination() {
        return pagination.value
      },
    },
    onSortingChange: (updater) => {
      sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
    },
    onColumnFiltersChange: (updater) => {
      columnFilters.value = typeof updater === 'function' ? updater(columnFilters.value) : updater
    },
    onGlobalFilterChange: (updater) => {
      globalFilter.value = typeof updater === 'function' ? updater(globalFilter.value) : updater
    },
    onColumnVisibilityChange: (updater) => {
      columnVisibility.value =
        typeof updater === 'function' ? updater(columnVisibility.value) : updater
    },
    onRowSelectionChange: (updater) => {
      rowSelection.value = typeof updater === 'function' ? updater(rowSelection.value) : updater
    },
    onExpandedChange: (updater) => {
      expanded.value = typeof updater === 'function' ? updater(expanded.value) : updater
    },
    onGroupingChange: (updater) => {
      grouping.value = typeof updater === 'function' ? updater(grouping.value) : updater
    },
    onPaginationChange: (updater) => {
      pagination.value = typeof updater === 'function' ? updater(pagination.value) : updater
    },
    getCoreRowModel: getCoreRowModel(),
    ...(enableSorting && !manualSorting && { getSortedRowModel: getSortedRowModel() }),
    ...(enableFiltering && !manualFiltering && { getFilteredRowModel: getFilteredRowModel() }),
    ...(enablePagination &&
      !manualPagination && { getPaginationRowModel: getPaginationRowModel() }),
    ...(enableGrouping && { getGroupedRowModel: getGroupedRowModel() }),
    ...(enableExpanding && { getExpandedRowModel: getExpandedRowModel() }),
    enableRowSelection,
    enableHiding: enableColumnVisibility,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    ...(manualPagination && { manualPagination: true }),
    ...(manualSorting && { manualSorting: true }),
    ...(manualFiltering && { manualFiltering: true }),
    ...(manualPagination && {
      get pageCount() {
        return resolvedPageCount.value
      },
      get rowCount() {
        return resolvedRowCount.value
      },
    }),
    ...(getRowId && { getRowId }),
    ...(getSubRows && { getSubRows }),
    ...(getRowCanExpand && { getRowCanExpand }),
  })

  watchEffect(() => {
    if (!manualPagination) return

    table.setOptions((prev) => ({
      ...prev,
      // `prev` is the live options proxy the Vue adapter built, and spreading
      // it MATERIALISES every getter — including `data` and `columns`.
      // Whatever they happened to be when this effect last ran would then be
      // frozen in place.
      //
      // That is a race with real symptoms: this effect fires when `rowCount`
      // arrives, which for a server-backed table is the same tick the rows
      // arrive. Land on the wrong side of it and the table renders an empty
      // body while the footer reports "Showing 0-0 of 48 rows" — the count is
      // read from `rowCount`, the body from the snapshot. Re-declaring the
      // getters after the spread keeps `data` and `columns` live (columns must
      // stay live so a locale change can rebuild headers).
      get data() {
        return data.value as T[]
      },
      get columns() {
        return resolvedColumns.value
      },
      pageCount: resolvedPageCount.value,
      rowCount: resolvedRowCount.value,
    }))
  })

  // Reset to first page when global filter changes
  watch(globalFilter, () => {
    pagination.value.pageIndex = 0
  })

  const selectedRows = computed(() => {
    return table.getSelectedRowModel().rows.map((r) => r.original)
  })

  const totalRows = computed(() => {
    if (
      resolvedRowCount.value !== undefined &&
      (manualPagination || manualFiltering || manualSorting)
    ) {
      return resolvedRowCount.value
    }

    if (enableFiltering && !manualFiltering) {
      return table.getFilteredRowModel().rows.length
    }

    return table.getCoreRowModel().rows.length
  })
  const pageCount_ = computed(() => table.getPageCount())
  const currentPage = computed(() => pagination.value.pageIndex + 1)
  const queryState = computed<DataTableQueryState>(() => ({
    globalFilter: globalFilter.value,
    sorting: sorting.value.map((entry) => ({
      id: entry.id,
      desc: entry.desc,
      direction: entry.desc ? 'desc' : 'asc',
    })),
    columnFilters: columnFilters.value.map((entry) => ({
      id: entry.id,
      value: entry.value,
    })),
    pagination: {
      ...pagination.value,
      page: pagination.value.pageIndex + 1,
    },
    grouping: [...grouping.value],
  }))

  return {
    table,
    // State refs (mutable)
    sorting,
    columnFilters,
    globalFilter,
    columnVisibility,
    rowSelection,
    expanded,
    grouping,
    pagination,
    // Computed
    selectedRows,
    totalRows,
    pageCount: pageCount_,
    currentPage,
    queryState,
  }
}
