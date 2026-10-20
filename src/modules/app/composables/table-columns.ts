import {
  formatValue,
  type ColumnDef,
  type RowKey,
  type TableColumn,
  type TableRow,
} from '@vueye-table/core'
import { Fragment, h, type VNodeChild } from 'vue'

import { TableDateCell, TableLinkCell, TableMoneyCell, TableStatusCell } from '@/components/table'
import { intlLocale } from '@/plugins/appearance'
import { i18n } from '@/plugins/i18n'
import { toMajorUnits, type Money } from '~/lib/money'

type AccessorKey<T> = Extract<keyof T, string>
type StatusVariant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error'

export interface TableCellContext<T> {
  row: T
  value: unknown
  column: TableColumn<T>
  rowKey: RowKey
}

export interface DataTableFilterOption {
  label: string
  value: string | number | boolean
}

export type DataTableFilterVariant = 'text' | 'select' | 'boolean'

export interface DataTableColumnMeta<T = unknown> extends Readonly<Record<string, unknown>> {
  filter?: {
    variant: DataTableFilterVariant
    placeholder?: string
    options?: DataTableFilterOption[]
  }
  /** Rich UI only. Vueye's `format` stays plain text for search, copy and export. */
  render?: (context: TableCellContext<T>) => VNodeChild
  hideable?: boolean
}

export type ColumnFilterSpec = DataTableFilterVariant | NonNullable<DataTableColumnMeta['filter']>

export interface ColumnChrome {
  label: string
  /** Pixel width, following Vueye's native column contract. */
  width?: number
  minWidth?: number
  align?: 'start' | 'center' | 'end'
  sortable?: boolean
  searchable?: boolean
  hidden?: boolean
  hideable?: boolean
  filter?: ColumnFilterSpec
}

function chrome<T>(
  options: ColumnChrome,
  defaults?: { width?: number; align?: ColumnChrome['align'] },
) {
  const filter = options.filter
    ? typeof options.filter === 'string'
      ? { variant: options.filter }
      : options.filter
    : undefined
  return {
    header: options.label,
    width: options.width ?? defaults?.width,
    minWidth: options.minWidth,
    align: options.align ?? defaults?.align,
    sortable: options.sortable,
    searchable: options.searchable,
    hidden: options.hidden,
    // Choice controls carry raw domain values even when `format` translates them.
    ...(filter && filter.variant !== 'text'
      ? {
          filter: (value: unknown, selected: unknown) =>
            selected === undefined || selected === '' || Object.is(value, selected),
        }
      : {}),
    meta: {
      ...(filter ? { filter } : {}),
      ...(options.hideable === undefined ? {} : { hideable: options.hideable }),
    } as DataTableColumnMeta<T>,
  }
}

/** Render metadata is deliberately separate from the engine's text formatter. */
export function renderTableCell<T>(row: TableRow<T>, column: TableColumn<T>): VNodeChild {
  const render = (column.meta as DataTableColumnMeta<T>).render
  return render
    ? render({ row: row.original, value: row.getValue(column.id), column, rowKey: row.key })
    : row.getDisplay(column.id)
}

/** A functional renderer lets both wrappers preserve VNodes without HTML strings. */
export function TableCellContent<T>(props: { row: TableRow<T>; column: TableColumn<T> }) {
  return h(Fragment, null, [renderTableCell(props.row, props.column)])
}

/** Native Vueye columns with the UI treatments shared by Vuestrata's lists. */
export function createColumns<T>() {
  return {
    text<K extends AccessorKey<T>>(
      id: K,
      options: ColumnChrome & {
        format?: (value: T[K], row: T) => string
        render?: (context: TableCellContext<T>) => VNodeChild
      },
    ): ColumnDef<T> {
      const base = chrome<T>(options)
      return {
        id,
        accessor: (row) => row[id],
        ...base,
        ...(options.format ? { format: options.format } : {}),
        meta: { ...base.meta, ...(options.render ? { render: options.render } : {}) },
      }
    },

    link<K extends AccessorKey<T>>(
      id: K,
      options: ColumnChrome & {
        to: string | ((row: T) => string)
        sublabel?: (row: T) => string | undefined
        text?: (row: T) => string
      },
    ): ColumnDef<T> {
      const base = chrome<T>(options)
      return {
        id,
        accessor: (row) => row[id],
        ...base,
        format: (value: T[K], row: T) => options.text?.(row) ?? formatValue(value),
        meta: {
          ...base.meta,
          render: ({ row, value }: TableCellContext<T>) =>
            h(TableLinkCell, {
              to: typeof options.to === 'function' ? options.to(row) : options.to,
              label: options.text?.(row) ?? formatValue(value),
              sublabel: options.sublabel?.(row),
            }),
        },
      }
    },

    status<K extends AccessorKey<T>>(
      id: K,
      options: ColumnChrome & {
        variant: (value: T[K], row: T) => StatusVariant
        labelFor: (value: T[K], row: T) => string
      },
    ): ColumnDef<T> {
      const base = chrome<T>(options, { width: 144 })
      return {
        id,
        accessor: (row) => row[id],
        ...base,
        format: options.labelFor,
        meta: {
          ...base.meta,
          render: ({ row, value }: TableCellContext<T>) =>
            h(TableStatusCell, {
              label: options.labelFor(value as T[K], row),
              variant: options.variant(value as T[K], row),
            }),
        },
      }
    },

    money<K extends AccessorKey<T>>(
      id: K,
      options: ColumnChrome & { compact?: boolean },
    ): ColumnDef<T> {
      const base = chrome<T>(options, { width: 144, align: 'end' })
      return {
        id,
        accessor: (row) => row[id],
        ...base,
        compare: (left: T[K], right: T[K]) => (left as Money).amount - (right as Money).amount,
        format: (value: T[K]) => {
          const amount = value as Money
          return new Intl.NumberFormat(intlLocale(i18n.global.locale.value), {
            style: 'currency',
            currency: amount.currency,
            notation: options.compact ? 'compact' : 'standard',
            maximumFractionDigits: options.compact ? 1 : 2,
          }).format(toMajorUnits(amount.amount))
        },
        meta: {
          ...base.meta,
          render: ({ value }: TableCellContext<T>) =>
            h(TableMoneyCell, { value: value as Money, compact: options.compact }),
        },
      }
    },

    date<K extends AccessorKey<T>>(
      id: K,
      options: ColumnChrome & { relative?: boolean },
    ): ColumnDef<T> {
      const base = chrome<T>(options, { width: 176, align: 'end' })
      return {
        id,
        accessor: (row) => row[id],
        ...base,
        format: (value: T[K]) => {
          const text = formatValue(value)
          const date = new Date(text)
          return Number.isNaN(date.getTime())
            ? text
            : new Intl.DateTimeFormat(intlLocale(i18n.global.locale.value), {
                day: 'numeric',
                month: 'short',
              }).format(date)
        },
        meta: {
          ...base.meta,
          render: ({ value }: TableCellContext<T>) => {
            const text = formatValue(value)
            return !text || Number.isNaN(new Date(text).getTime())
              ? text || '—'
              : h(TableDateCell, { value: text, relative: options.relative })
          },
        },
      }
    },

    display(
      id: string,
      options: ColumnChrome & {
        cell: (context: TableCellContext<T>) => VNodeChild
        text?: (row: T) => string
      },
    ): ColumnDef<T> {
      const base = chrome<T>({ sortable: false, searchable: false, ...options })
      return {
        id,
        accessor: (row) => options.text?.(row) ?? '',
        ...base,
        meta: { ...base.meta, render: options.cell },
      }
    },
  }
}
