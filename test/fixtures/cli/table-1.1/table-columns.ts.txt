/**
 * Column factories for `UiDataGrid`.
 *
 * TanStack still owns the column defs — these helpers only collapse the
 * repetition every list was typing by hand: `header` duplicated as
 * `meta.label`, and `h(Table*Cell, { … })` for the four cells every domain
 * list needs. Escape hatch: `createColumnHelper` and a custom `cell`.
 */
import type { CellContext, ColumnDef } from '@tanstack/vue-table'
import { h } from 'vue'

import { TableDateCell, TableLinkCell, TableMoneyCell, TableStatusCell } from '@/components/table'
import type { Money } from '~/lib/money'

import type { DataTableColumnMeta, DataTableFilterVariant } from './useDataTable'

type AccessorKey<TData> = Extract<keyof TData, string>
type ColumnAlign = NonNullable<DataTableColumnMeta['align']>
type StatusVariant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error'

export type ColumnFilterSpec = DataTableFilterVariant | NonNullable<DataTableColumnMeta['filter']>

export interface ColumnChrome {
  label: string
  width?: string
  align?: ColumnAlign
  enableSorting?: boolean
  filter?: ColumnFilterSpec
}

interface ColumnChromeResolved {
  header: string
  enableSorting?: boolean
  meta: DataTableColumnMeta
}

function resolveFilter(
  filter: ColumnFilterSpec | undefined,
): DataTableColumnMeta['filter'] | undefined {
  if (!filter) return undefined
  if (typeof filter === 'string') return { variant: filter }
  return filter
}

function withChrome(
  options: ColumnChrome,
  defaults?: { width?: string; align?: ColumnAlign },
): ColumnChromeResolved {
  const width = options.width ?? defaults?.width
  const align = options.align ?? defaults?.align
  const filter = resolveFilter(options.filter)

  return {
    header: options.label,
    ...(options.enableSorting === undefined ? {} : { enableSorting: options.enableSorting }),
    meta: {
      label: options.label,
      ...(width ? { width } : {}),
      ...(align ? { align } : {}),
      ...(filter ? { filter } : {}),
    },
  }
}

function cellString(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return ''
}

function valueOf<TData, TKey extends AccessorKey<TData>>(
  ctx: CellContext<TData, unknown>,
): TData[TKey] {
  return ctx.getValue() as TData[TKey]
}

export function createColumns<TData>() {
  return {
    text<TKey extends AccessorKey<TData>>(
      accessor: TKey,
      options: ColumnChrome & {
        format?: (value: TData[TKey], row: TData) => unknown
      },
    ): ColumnDef<TData> {
      return {
        accessorKey: accessor,
        ...withChrome(options),
        ...(options.format
          ? {
              cell: (ctx: CellContext<TData, unknown>) =>
                options.format!(valueOf<TData, TKey>(ctx), ctx.row.original),
            }
          : {}),
      }
    },

    link<TKey extends AccessorKey<TData>>(
      accessor: TKey,
      options: ColumnChrome & {
        to: string | ((row: TData) => string)
        sublabel?: (row: TData) => string | undefined
        text?: (row: TData) => string
      },
    ): ColumnDef<TData> {
      return {
        accessorKey: accessor,
        ...withChrome(options),
        cell: (ctx: CellContext<TData, unknown>) =>
          h(TableLinkCell, {
            to: typeof options.to === 'function' ? options.to(ctx.row.original) : options.to,
            label: options.text ? options.text(ctx.row.original) : cellString(ctx.getValue()),
            sublabel: options.sublabel?.(ctx.row.original),
          }),
      }
    },

    status<TKey extends AccessorKey<TData>>(
      accessor: TKey,
      options: ColumnChrome & {
        variant: (value: TData[TKey], row: TData) => StatusVariant
        labelFor: (value: TData[TKey], row: TData) => string
      },
    ): ColumnDef<TData> {
      return {
        accessorKey: accessor,
        ...withChrome(options, { width: '9rem' }),
        cell: (ctx: CellContext<TData, unknown>) => {
          const value = valueOf<TData, TKey>(ctx)
          return h(TableStatusCell, {
            label: options.labelFor(value, ctx.row.original),
            variant: options.variant(value, ctx.row.original),
          })
        },
      }
    },

    money<TKey extends AccessorKey<TData>>(
      accessor: TKey,
      options: ColumnChrome & { compact?: boolean },
    ): ColumnDef<TData> {
      return {
        accessorKey: accessor,
        ...withChrome(options, { width: '9rem', align: 'end' }),
        cell: (ctx: CellContext<TData, unknown>) =>
          h(TableMoneyCell, { value: ctx.getValue() as Money, compact: options.compact }),
      }
    },

    date<TKey extends AccessorKey<TData>>(
      accessor: TKey,
      options: ColumnChrome & { relative?: boolean },
    ): ColumnDef<TData> {
      return {
        accessorKey: accessor,
        ...withChrome(options, { width: '11rem', align: 'end' }),
        cell: (ctx: CellContext<TData, unknown>) =>
          h(TableDateCell, { value: cellString(ctx.getValue()), relative: options.relative }),
      }
    },

    display(
      id: string,
      options: ColumnChrome & { cell: (row: TData) => unknown },
    ): ColumnDef<TData> {
      return {
        id,
        ...withChrome(options),
        cell: (ctx: CellContext<TData, unknown>) => options.cell(ctx.row.original),
      }
    },
  }
}
