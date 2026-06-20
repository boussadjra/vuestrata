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
} from '@tanstack/vue-table'

export { createColumnHelper }
export type {
  ColumnDef,
  Row,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
  PaginationState,
  RowSelectionState,
}

export interface UseDataTableOptions<T> {
  data: T[] | (() => T[])
  columns: ColumnDef<T, unknown>[]
  enableSorting?: boolean
  enableFiltering?: boolean
  enablePagination?: boolean
  enableRowSelection?: boolean
  enableColumnVisibility?: boolean
  enableGrouping?: boolean
  enableExpanding?: boolean
  pageSize?: number
  manualPagination?: boolean
  pageCount?: number
  globalFilterFn?: (row: Row<T>, columnId: string, filterValue: string) => boolean
}

export function useDataTable<T>(options: UseDataTableOptions<T>) {
  const {
    columns,
    enableSorting = true,
    enableFiltering = true,
    enablePagination = true,
    enableRowSelection = false,
    enableColumnVisibility = false,
    enableGrouping = false,
    enableExpanding = false,
    pageSize = 10,
    manualPagination = false,
    pageCount,
  } = options

  const data = typeof options.data === 'function' ? computed(options.data) : ref(options.data)

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
    columns,
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
    ...(enableSorting && { getSortedRowModel: getSortedRowModel() }),
    ...(enableFiltering && { getFilteredRowModel: getFilteredRowModel() }),
    ...(enablePagination &&
      !manualPagination && { getPaginationRowModel: getPaginationRowModel() }),
    ...(enableGrouping && { getGroupedRowModel: getGroupedRowModel() }),
    ...(enableExpanding && { getExpandedRowModel: getExpandedRowModel() }),
    enableRowSelection,
    enableHiding: enableColumnVisibility,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    ...(manualPagination && { manualPagination: true, pageCount }),
  })

  // Reset to first page when global filter changes
  watch(globalFilter, () => {
    pagination.value.pageIndex = 0
  })

  const selectedRows = computed(() => {
    return table.getSelectedRowModel().rows.map((r) => r.original)
  })

  const totalRows = computed(() => table.getFilteredRowModel().rows.length)
  const pageCount_ = computed(() => table.getPageCount())
  const currentPage = computed(() => pagination.value.pageIndex + 1)

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
  }
}
