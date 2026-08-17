import { describe, expect, it } from 'vite-plus/test'
import type { VNode } from 'vue'

import TableDateCell from '@/components/table/TableDateCell.vue'
import TableLinkCell from '@/components/table/TableLinkCell.vue'
import TableMoneyCell from '@/components/table/TableMoneyCell.vue'
import TableStatusCell from '@/components/table/TableStatusCell.vue'
import { createColumns } from '@/composables/table-columns'
import { money } from '~/lib/money'

interface CustomerRow {
  id: string
  company: string
  city: string
  status: 'active' | 'churned'
  plan: 'starter' | 'scale'
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

function invokeCell(column: { cell?: unknown; accessorKey?: unknown }, original: CustomerRow) {
  const cell = column.cell
  if (typeof cell !== 'function') {
    throw new Error('Expected a cell render function')
  }

  const value =
    typeof column.accessorKey === 'string'
      ? original[column.accessorKey as keyof CustomerRow]
      : undefined

  return cell({
    getValue: () => value,
    row: { original },
  })
}

describe('createColumns', () => {
  const col = createColumns<CustomerRow>()

  it('sets header and meta.label from a single label', () => {
    const column = col.text('company', { label: 'Company', width: '18rem' })

    expect(column.header).toBe('Company')
    expect(column.meta).toMatchObject({ label: 'Company', width: '18rem' })
  })

  it('expands a filter shorthand into column meta', () => {
    const column = col.text('company', { label: 'Company', filter: 'text' })

    expect(column.meta?.filter).toEqual({ variant: 'text' })
  })

  it('renders a link cell from to / sublabel helpers', () => {
    const column = col.link('company', {
      label: 'Company',
      to: (record) => `/dashboard/customers/${record.id}`,
      sublabel: (record) => record.city,
    })
    const vnode = invokeCell(column, row) as VNode

    expect(vnode.type).toBe(TableLinkCell)
    expect(vnode.props).toMatchObject({
      to: '/dashboard/customers/c-1',
      label: 'Atlas',
      sublabel: 'Lisbon',
    })
  })

  it('renders a status cell from variant and labelFor', () => {
    const column = col.status('status', {
      label: 'Status',
      variant: (status) => (status === 'active' ? 'success' : 'error'),
      labelFor: (status) => status.toUpperCase(),
    })
    const vnode = invokeCell(column, row) as VNode

    expect(column.meta).toMatchObject({ width: '9rem' })
    expect(vnode.type).toBe(TableStatusCell)
    expect(vnode.props).toMatchObject({ label: 'ACTIVE', variant: 'success' })
  })

  it('renders a money cell with end alignment by default', () => {
    const column = col.money('mrr', { label: 'MRR' })
    const vnode = invokeCell(column, row) as VNode

    expect(column.meta).toMatchObject({ align: 'end', width: '9rem' })
    expect(vnode.type).toBe(TableMoneyCell)
    expect(vnode.props).toMatchObject({ value: row.mrr })
  })

  it('renders a date cell with end alignment by default', () => {
    const column = col.date('lastContactAt', { label: 'Last contact', relative: true })
    const vnode = invokeCell(column, row) as VNode

    expect(column.meta).toMatchObject({ align: 'end', width: '11rem' })
    expect(vnode.type).toBe(TableDateCell)
    expect(vnode.props).toMatchObject({ value: '2026-01-15', relative: true })
  })

  it('formats a text cell through format()', () => {
    const column = col.text('plan', {
      label: 'Plan',
      format: (plan) => `plan_${plan}`,
    })

    expect(invokeCell(column, row)).toBe('plan_scale')
  })

  it('builds a display column from a row callback', () => {
    const column = col.display('items', {
      label: 'Items',
      align: 'end',
      cell: (record) => record.itemCount,
    })

    expect(column.id).toBe('items')
    expect(column.header).toBe('Items')
    expect(column.meta).toMatchObject({ label: 'Items', align: 'end' })
    expect(invokeCell(column, row)).toBe(4)
  })
})
