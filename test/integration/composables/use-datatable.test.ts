import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'

import { createColumns, useDataTable, type UseDataTableOptions } from '@/composables/useDataTable'
import { i18n } from '@/plugins/i18n'

interface Row {
  id: number
  name: string
  value: number
  children?: Row[]
}
const col = createColumns<Row>()
const columns = [
  col.text('id', { label: 'ID' }),
  col.text('name', { label: 'Name', filter: 'text' }),
  col.text('value', { label: 'Value' }),
]
const sampleData: Row[] = [
  { id: 1, name: 'Alpha', value: 30 },
  { id: 2, name: 'Beta', value: 10 },
  { id: 3, name: 'Gamma', value: 20 },
  { id: 4, name: 'Delta', value: 40 },
  { id: 5, name: 'Epsilon', value: 50 },
]
const scopes: EffectScope[] = []
function makeTable(options: Partial<UseDataTableOptions<Row>> = {}) {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useDataTable<Row>({ data: sampleData, columns, ...options }))!
}
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  i18n.global.locale.value = 'en'
})

describe('useDataTable native Vueye binding', () => {
  it('exposes native state and one-based pagination', () => {
    const { table, state, currentPage, totalRows } = makeTable()
    expect(state.value.pagination).toEqual({ page: 1, pageSize: 10 })
    expect(state.value.sorting).toEqual([])
    expect(state.value.search).toBe('')
    expect(currentPage.value).toBe(1)
    expect(totalRows.value).toBe(5)
    expect(table.value.rows[0]?.original).toBe(sampleData[0])
  })

  it('pages client rows through native operations', () => {
    const { table, pageCount, currentPage } = makeTable({
      initialState: { pagination: { page: 1, pageSize: 2 } },
    })
    expect(pageCount.value).toBe(3)
    expect(table.value.rows.map((row) => row.key)).toEqual([1, 2])
    table.value.nextPage()
    expect(currentPage.value).toBe(2)
    expect(table.value.rows.map((row) => row.key)).toEqual([3, 4])
    table.value.goToPage(99)
    expect(currentPage.value).toBe(3)
  })

  it('searches and filters client rows then resets the current page', () => {
    const { table, totalRows } = makeTable({
      initialState: { pagination: { page: 3, pageSize: 2 } },
    })
    table.value.search('alpha')
    expect(totalRows.value).toBe(1)
    expect(table.value.page).toBe(1)
    table.value.search('')
    table.value.filter('value', { min: 40 })
    expect(table.value.processedRows.map((row) => row.key)).toEqual([4, 5])
    table.value.clearFilters()
    expect(totalRows.value).toBe(5)
  })

  it('sorts values and keeps custom rich renderers out of engine formatting', () => {
    const { table, state } = makeTable()
    table.value.sort('value', 'asc')
    expect(state.value.sorting).toEqual([{ column: 'value', direction: 'asc' }])
    expect(table.value.rows.map((row) => row.original.value)).toEqual([10, 20, 30, 40, 50])
  })

  it('retains selection keys across pages and returns selected domain records', () => {
    const { table, selectedRows } = makeTable({
      initialState: { pagination: { page: 1, pageSize: 2 } },
    })
    table.value.select([1])
    table.value.nextPage()
    table.value.select([3])
    expect(table.value.state.selection).toEqual([1, 3])
    expect(selectedRows.value.map((row) => row.id)).toEqual([1, 3])
    table.value.clearSelection()
    expect(selectedRows.value).toEqual([])
  })

  it('toggles column visibility with native hidden column state', () => {
    const { table } = makeTable()
    table.value.toggleColumn('value', false)
    expect(table.value.state.hiddenColumns).toEqual(['value'])
    expect(table.value.columns.map((column) => column.id)).toEqual(['id', 'name'])
    table.value.toggleColumn('value', true)
    expect(table.value.columns).toHaveLength(3)
  })

  it('presents server data without running client filtering, sorting or pagination', () => {
    const { table, state, totalRows, pageCount } = makeTable({
      data: sampleData.slice(0, 2),
      manual: true,
      rowCount: 5,
      initialState: { pagination: { page: 1, pageSize: 2 } },
    })
    table.value.search('not on this page')
    table.value.sort('value', 'asc')
    table.value.filter('name', 'missing')
    table.value.goToPage(2)
    expect(table.value.rows.map((row) => row.key)).toEqual([1, 2])
    expect(totalRows.value).toBe(5)
    expect(pageCount.value).toBe(3)
    expect(state.value.pagination).toEqual({ page: 2, pageSize: 2 })
    expect(state.value.filters).toEqual({ name: 'missing' })
  })

  it('updates server data, total and reactive columns after a query resolves', async () => {
    const data = ref<Row[]>([])
    const rowCount = ref<number | undefined>()
    const headings = ref(columns)
    const { table } = makeTable({
      data,
      columns: headings,
      rowCount,
      manual: true,
      initialState: { pagination: { page: 1, pageSize: 2 } },
    })
    data.value = sampleData.slice(0, 2)
    rowCount.value = 5
    headings.value = [col.text('name', { label: 'Customer name' })]
    await nextTick()
    expect(table.value.rows.map((row) => row.key)).toEqual([1, 2])
    expect(table.value.rowCount).toBe(5)
    expect(table.value.pageCount).toBe(3)
    expect(table.value.columns[0]?.header).toBe('Customer name')
  })

  it('applies controlled state without feeding onStateChange back to its owner', async () => {
    const owner = ref({ search: '', pagination: { page: 1, pageSize: 2 } })
    const changed = vi.fn()
    const { table } = makeTable({
      manual: true,
      rowCount: 10,
      state: owner,
      onStateChange: changed,
    })
    owner.value = { search: 'Alpha', pagination: { page: 2, pageSize: 2 } }
    await nextTick()
    expect(table.value.state.search).toBe('Alpha')
    expect(table.value.page).toBe(2)
    expect(changed).not.toHaveBeenCalled()
    table.value.nextPage()
    expect(changed).toHaveBeenCalledOnce()
  })

  it('supports stable native keys and tree expansion', () => {
    const data: Row[] = [
      { id: 1, name: 'Parent', value: 1, children: [{ id: 11, name: 'Child', value: 11 }] },
      { id: 2, name: 'Other', value: 2 },
    ]
    const { table } = makeTable({ data, rowKey: 'id', getChildren: (row) => row.children })
    expect(table.value.tree).toBe(true)
    expect(table.value.rows.map((row) => row.key)).toEqual([1, 2])
    table.value.toggleExpanded(1)
    expect(table.value.rows.map((row) => row.key)).toEqual([1, 11, 2])
    expect(table.value.getRow(11)?.depth).toBe(1)
    table.value.toggleExpanded(1, false)
    expect(table.value.rows.map((row) => row.key)).toEqual([1, 2])
  })

  it('keeps detail expansion separate from pagination row counts', () => {
    const { table } = makeTable({ getRowCanExpand: () => true })
    table.value.toggleExpanded(1)
    expect(table.value.rows).toHaveLength(5)
    expect(table.value.renderItems.filter((item) => item.kind === 'detail')).toHaveLength(1)
    expect(table.value.rowCount).toBe(5)
  })

  it('exports every filtered row rather than just the current page', () => {
    const { table } = makeTable({ initialState: { pagination: { page: 1, pageSize: 1 } } })
    table.value.filter('value', { min: 40 })
    const csv = table.value.exportRows()
    expect(csv).toContain('Delta')
    expect(csv).toContain('Epsilon')
    expect(csv).not.toContain('Alpha')
    expect(table.value.exportRows({ pageOnly: true })).not.toContain('Epsilon')
  })

  it('recreates collation for a language change, retaining serializable state', async () => {
    const data = ref([...sampleData])
    const { table } = makeTable({
      data,
      getRowCanExpand: () => true,
      initialState: { pagination: { page: 1, pageSize: 2 } },
    })
    table.value.sort('name', 'desc')
    table.value.select([4])
    table.value.toggleExpanded(4)
    table.value.toggleColumn('value', false)
    table.value.goToPage(2)
    const previous = table.value
    const before = previous.state
    const oldSnapshot = previous.snapshot
    i18n.global.locale.value = 'fr'
    expect(table.value).not.toBe(previous)
    expect(table.value.state).toEqual(before)
    data.value = [...data.value, { id: 6, name: 'New row', value: 60 }]
    await nextTick()
    expect(table.value.totalRowCount).toBe(6)
    expect(previous.snapshot).toBe(oldSnapshot)
    expect(previous.totalRowCount).toBe(5)
  })

  it('disposes data watchers and subscriptions with its owner scope', async () => {
    const data = ref([...sampleData])
    const { table } = makeTable({ data })
    const before = table.value.snapshot
    scopes.at(-1)!.stop()
    data.value = []
    await nextTick()
    expect(table.value.snapshot).toBe(before)
  })
})
