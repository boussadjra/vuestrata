import { describe, it, expect } from 'vite-plus/test'

import { useDataTable, createColumnHelper } from '@/composables/useDataTable'

interface Row {
  id: number
  name: string
  value: number
}

const helper = createColumnHelper<Row>()
const columns = [
  helper.accessor('id', { header: 'ID' }),
  helper.accessor('name', { header: 'Name' }),
  helper.accessor('value', { header: 'Value' }),
]

const sampleData: Row[] = [
  { id: 1, name: 'Alpha', value: 30 },
  { id: 2, name: 'Beta', value: 10 },
  { id: 3, name: 'Gamma', value: 20 },
  { id: 4, name: 'Delta', value: 40 },
  { id: 5, name: 'Epsilon', value: 50 },
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
})
