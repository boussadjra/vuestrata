import { describe, it, expect } from 'vite-plus/test'

import { useDataTable, createColumnHelper } from '@/composables/useDataTable'

interface Row {
  id: number
  name: string
  value: number
}

interface TreeRow {
  id: string
  name: string
  children?: TreeRow[]
}

const helper = createColumnHelper<Row>()
const columns = [
  helper.accessor('id', { header: 'ID' }),
  helper.accessor('name', { header: 'Name' }),
  helper.accessor('value', { header: 'Value' }),
]

const treeHelper = createColumnHelper<TreeRow>()
const treeColumns = [treeHelper.accessor('name', { header: 'Name' })]

const sampleData: Row[] = [
  { id: 1, name: 'Alpha', value: 30 },
  { id: 2, name: 'Beta', value: 10 },
  { id: 3, name: 'Gamma', value: 20 },
  { id: 4, name: 'Delta', value: 40 },
  { id: 5, name: 'Epsilon', value: 50 },
]

const treeData: TreeRow[] = [
  {
    id: 'parent-1',
    name: 'Parent 1',
    children: [{ id: 'child-1', name: 'Child 1' }],
  },
  { id: 'parent-2', name: 'Parent 2' },
]

describe('useDataTable', () => {
  it('should initialize with default state', () => {
    const { table, sorting, globalFilter, pagination, currentPage, totalRows } = useDataTable({
      data: sampleData,
      columns,
    })
    expect(table).toBeDefined()
    expect(sorting.value).toEqual([])
    expect(globalFilter.value).toBe('')
    expect(pagination.value.pageIndex).toBe(0)
    expect(pagination.value.pageSize).toBe(10)
    expect(currentPage.value).toBe(1)
    expect(totalRows.value).toBe(5)
  })

  it('should accept a custom page size', () => {
    const { pagination } = useDataTable({
      data: sampleData,
      columns,
      pageSize: 2,
    })
    expect(pagination.value.pageSize).toBe(2)
  })

  it('should support pagination', () => {
    const { table, pageCount, currentPage } = useDataTable({
      data: sampleData,
      columns,
      pageSize: 2,
    })
    expect(pageCount.value).toBe(3) // 5 items / 2 per page = 3 pages
    expect(currentPage.value).toBe(1)
    expect(table.getRowModel().rows).toHaveLength(2)

    // Go to next page
    table.nextPage()
    expect(currentPage.value).toBe(2)
  })

  it('should track global filter', () => {
    const { globalFilter, totalRows } = useDataTable({
      data: sampleData,
      columns,
    })
    globalFilter.value = 'Alpha'
    expect(totalRows.value).toBe(1)
  })

  it('should expose selectedRows when row selection is enabled', () => {
    const { selectedRows } = useDataTable({
      data: sampleData,
      columns,
      enableRowSelection: true,
    })
    expect(selectedRows.value).toEqual([])
  })

  it('should track sorting state', () => {
    const { sorting } = useDataTable({
      data: sampleData,
      columns,
    })
    sorting.value = [{ id: 'value', desc: false }]
    expect(sorting.value).toEqual([{ id: 'value', desc: false }])
  })

  it('should accept data as a getter function', () => {
    const items = [...sampleData]
    const { totalRows } = useDataTable({
      data: () => items,
      columns,
    })
    expect(totalRows.value).toBe(5)
  })

  it('should expose column visibility state', () => {
    const { columnVisibility } = useDataTable({
      data: sampleData,
      columns,
      enableColumnVisibility: true,
    })
    expect(columnVisibility.value).toEqual({})
  })

  it('should expose normalized query state for manual server-side tables', () => {
    const currentPageRows = sampleData.slice(0, 2)

    const {
      table,
      sorting,
      columnFilters,
      globalFilter,
      pagination,
      queryState,
      totalRows,
      pageCount,
    } = useDataTable({
      data: currentPageRows,
      columns,
      pageSize: 2,
      manualPagination: true,
      manualSorting: true,
      manualFiltering: true,
      rowCount: 5,
    })

    sorting.value = [{ id: 'value', desc: true }]
    columnFilters.value = [{ id: 'name', value: 'Alpha' }]
    globalFilter.value = 'Alpha'
    pagination.value = { pageIndex: 1, pageSize: 2 }

    expect(table.getRowModel().rows.map((row) => row.original.id)).toEqual([1, 2])
    expect(totalRows.value).toBe(5)
    expect(pageCount.value).toBe(3)
    expect(queryState.value).toEqual({
      globalFilter: 'Alpha',
      sorting: [{ id: 'value', desc: true, direction: 'desc' }],
      columnFilters: [{ id: 'name', value: 'Alpha' }],
      pagination: { pageIndex: 1, pageSize: 2, page: 2 },
      grouping: [],
    })
  })

  it('should react to query-backed rowCount and pageCount updates', async () => {
    const rowCount = ref<number | undefined>(undefined)
    const pageCount = ref<number | undefined>(undefined)

    const { totalRows, pageCount: resolvedPageCount } = useDataTable({
      data: sampleData.slice(0, 2),
      columns,
      pageSize: 2,
      manualPagination: true,
      manualFiltering: true,
      manualSorting: true,
      rowCount,
      pageCount,
    })

    expect(totalRows.value).toBe(2)

    rowCount.value = 5
    pageCount.value = 3

    await nextTick()

    expect(totalRows.value).toBe(5)
    expect(resolvedPageCount.value).toBe(3)
  })

  it('should support custom row ids and nested sub rows for expandable tables', () => {
    const { table } = useDataTable({
      data: treeData,
      columns: treeColumns,
      enableExpanding: true,
      getRowId: (row) => row.id,
      getSubRows: (row) => row.children,
    })

    expect(table.getRowModel().rows.map((row) => row.id)).toEqual(['parent-1', 'parent-2'])

    const firstRow = table.getRowModel().rows[0]
    expect(firstRow).toBeDefined()

    if (!firstRow) {
      throw new Error('Expected the first row to exist')
    }

    expect(firstRow.getCanExpand()).toBe(true)

    firstRow.toggleExpanded()

    expect(table.getRowModel().rows.map((row) => row.id)).toEqual([
      'parent-1',
      'child-1',
      'parent-2',
    ])
    expect(table.getRow('child-1').original.name).toBe('Child 1')
  })
})
