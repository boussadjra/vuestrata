import type { TableState } from '@vueye-table/core'
import {
  useDataTable as useVueyeTable,
  type DataTableBinding,
  type UseDataTableOptions,
} from '@vueye-table/vue'
import {
  computed,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  watch,
  type EffectScope,
  type ShallowRef,
} from 'vue'

import { intlLocale } from '@/plugins/appearance'
import { i18n } from '@/plugins/i18n'

export { createColumns } from './table-columns'
export type {
  ColumnChrome,
  ColumnFilterSpec,
  DataTableColumnMeta,
  DataTableFilterOption,
  DataTableFilterVariant,
  TableCellContext,
} from './table-columns'
export type {
  ColumnDef,
  ExpandedState,
  PaginationState,
  RowKey,
  SortDirection,
  SortRule,
  TableColumn,
  TableRow,
  TableState,
  TableStatePatch,
} from '@vueye-table/core'
export type { DataTableBinding, UseDataTableOptions } from '@vueye-table/vue'

/**
 * Vuestrata's table lifetime, over the native Vueye binding. Operations and
 * state keep Vueye's names and one-based pages; no second table API sits here.
 *
 * Vueye reads its collation locale at creation. A language change therefore
 * replaces the binding inside a fresh scope, retaining serializable state
 * and disposing the previous binding's subscriptions, source and watchers.
 */
export function useDataTable<T>(options: UseDataTableOptions<T>) {
  const table = shallowRef<DataTableBinding<T>>()
  let bindingScope: EffectScope | undefined

  function createBinding(locale: string) {
    const previousState = table.value?.state
    bindingScope?.stop()
    bindingScope = effectScope(true)
    table.value = bindingScope.run(() =>
      useVueyeTable<T>({
        ...options,
        locale,
        initialState: previousState ?? options.initialState,
      }),
    )!
  }

  const stopLocale = watch(
    () => options.locale ?? intlLocale(i18n.global.locale.value),
    createBinding,
    { immediate: true, flush: 'sync' },
  )

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopLocale()
      bindingScope?.stop()
    })
  }

  // Creation above is synchronous, so callers always receive an initialized ref.
  const binding = table as ShallowRef<DataTableBinding<T>>
  const state = computed<TableState>(() => binding.value.state)
  const selectedRows = computed(() => {
    // Native operations are plain functions; track the reactive snapshot before
    // asking the engine for the currently loaded selected records.
    void binding.value.snapshot
    return binding.value.getSelectedRows().map((row) => row.original)
  })
  const totalRows = computed(() => binding.value.rowCount)
  const pageCount = computed(() => binding.value.pageCount)
  const currentPage = computed(() => binding.value.page)

  return { table: binding, state, selectedRows, totalRows, pageCount, currentPage }
}
