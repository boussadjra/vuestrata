import { createTable, type ColumnDef } from '@vueye-table/core'
import { describe, expect, it } from 'vite-plus/test'
import { h, type VNode } from 'vue'

import TableDateCell from '@/components/table/TableDateCell.vue'
import TableLinkCell from '@/components/table/TableLinkCell.vue'
import TableMoneyCell from '@/components/table/TableMoneyCell.vue'
import TableStatusCell from '@/components/table/TableStatusCell.vue'
import { createColumns, renderTableCell } from '@/composables/table-columns'
import { money } from '~/lib/money'

interface CustomerRow {
  id: string
  company: string
  city: string
  status: 'active' | 'churned'
  plan: string
  mrr: ReturnType<typeof money>
  lastContactAt: string
  itemCount: number
}
const row: CustomerRow = {
  id: 'c-1',
  company: 'Atlas',
  city: 'Lisbon',
  status: 'active',
  plan: 'scale',
  mrr: money(120_000, 'USD'),
  lastContactAt: '2026-01-15',
  itemCount: 4,
}
const col = createColumns<CustomerRow>()
function resolve(column: ColumnDef<CustomerRow>) {
  const table = createTable({ data: [row], columns: [column] })
  const snapshot = table.getSnapshot()
  return { column: snapshot.columns[0]!, row: snapshot.rows[0]!, table }
}

describe('createColumns native Vueye factories', () => {
  it('sets native heading, numeric pixel width and align with one label', () => {
    const column = col.text('company', { label: 'Company', width: 288, align: 'end' })
    expect(column).toMatchObject({ id: 'company', header: 'Company', width: 288, align: 'end' })
  })
  it('expands filter shorthand into UI metadata', () => {
    expect(col.text('company', { label: 'Company', filter: 'text' }).meta?.filter).toEqual({
      variant: 'text',
    })
  })
  it('renders a link but exports plain cell text', () => {
    const fixture = resolve(
      col.link('company', {
        label: 'Company',
        to: (record) => `/customers/${record.id}`,
        sublabel: (record) => record.city,
      }),
    )
    const vnode = renderTableCell(fixture.row, fixture.column) as VNode
    expect(vnode.type).toBe(TableLinkCell)
    expect(vnode.props).toMatchObject({ to: '/customers/c-1', label: 'Atlas', sublabel: 'Lisbon' })
    expect(fixture.table.exportRows()).toBe('Company\nAtlas')
  })
  it('uses translated status text for display and search while choice filters compare raw values', () => {
    const fixture = resolve(
      col.status('status', {
        label: 'Status',
        variant: () => 'success',
        labelFor: () => 'Actif',
        filter: { variant: 'select', options: [{ label: 'Actif', value: 'active' }] },
      }),
    )
    const vnode = renderTableCell(fixture.row, fixture.column) as VNode
    expect(vnode.type).toBe(TableStatusCell)
    expect(vnode.props).toMatchObject({ label: 'Actif', variant: 'success' })
    fixture.table.filter('status', 'active')
    expect(fixture.table.getSnapshot().rowCount).toBe(1)
    fixture.table.search('actif')
    expect(fixture.table.getSnapshot().rowCount).toBe(1)
    expect(fixture.column.width).toBe(144)
  })
  it('renders money with end alignment and plain export formatting', () => {
    const fixture = resolve(col.money('mrr', { label: 'MRR' }))
    const vnode = renderTableCell(fixture.row, fixture.column) as VNode
    expect(fixture.column).toMatchObject({ align: 'end', width: 144 })
    expect(vnode.type).toBe(TableMoneyCell)
    expect(vnode.props).toMatchObject({ value: row.mrr })
    expect(fixture.row.getDisplay('mrr')).toContain('1,200.00')
    expect(fixture.table.exportRows()).not.toContain('[object Object]')
  })
  it('sorts money by minor-unit amount rather than object text', () => {
    const table = createTable({
      data: [{ ...row, id: 'small', mrr: money(1) }, row],
      columns: [col.money('mrr', { label: 'MRR' })],
    })
    table.sort('mrr', 'desc')
    expect(table.getSnapshot().rows.map((entry) => entry.key)).toEqual(['c-1', 'small'])
  })
  it('renders a date component with a separate plain formatter', () => {
    const fixture = resolve(col.date('lastContactAt', { label: 'Last contact', relative: true }))
    const vnode = renderTableCell(fixture.row, fixture.column) as VNode
    expect(fixture.column).toMatchObject({ align: 'end', width: 176 })
    expect(vnode.type).toBe(TableDateCell)
    expect(vnode.props).toMatchObject({ value: '2026-01-15', relative: true })
    expect(fixture.row.getDisplay('lastContactAt')).toContain('Jan')
  })
  it('keeps missing or invalid dates out of the date formatter component', () => {
    const column = col.date('lastContactAt', { label: 'Last contact' })
    const table = createTable({
      data: [
        { ...row, id: 'empty', lastContactAt: '' },
        { ...row, id: 'invalid', lastContactAt: 'unknown' },
      ],
      columns: [column],
    })
    const snapshot = table.getSnapshot()
    expect(renderTableCell(snapshot.rows[0]!, snapshot.columns[0]!)).toBe('—')
    expect(renderTableCell(snapshot.rows[1]!, snapshot.columns[0]!)).toBe('unknown')
    expect(table.exportRows()).toContain('unknown')
  })
  it('keeps rich renderer context typed and text formatting independent', () => {
    const fixture = resolve(
      col.text('plan', {
        label: 'Plan',
        format: (plan) => `plan_${plan}`,
        render: ({ row: record, rowKey, value, column }) =>
          h('strong', { 'data-key': rowKey }, `${record.company}:${String(value)}:${column.id}`),
      }),
    )
    expect(fixture.row.getDisplay('plan')).toBe('plan_scale')
    const vnode = renderTableCell(fixture.row, fixture.column) as VNode
    expect(vnode.type).toBe('strong')
    expect(vnode.props?.['data-key']).toBe('c-1')
    expect(vnode.children).toBe('Atlas:scale:plan')
  })
  it('builds display columns with optional plain text and nonhideable metadata', () => {
    const fixture = resolve(
      col.display('items', {
        label: 'Items',
        align: 'end',
        hideable: false,
        text: (record) => String(record.itemCount),
        cell: ({ row: record, rowKey }) => `${record.itemCount}:${rowKey}`,
      }),
    )
    expect(fixture.column).toMatchObject({
      id: 'items',
      header: 'Items',
      align: 'end',
      sortable: false,
      searchable: false,
      meta: { hideable: false },
    })
    expect(fixture.row.getDisplay('items')).toBe('4')
    expect(renderTableCell(fixture.row, fixture.column)).toBe('4:c-1')
  })
})
