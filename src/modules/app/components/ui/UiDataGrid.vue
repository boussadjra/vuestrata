<script setup lang="ts" generic="TData">
import type { RowKey, TableRow } from '@vueye-table/core'
import type { DataTableBinding } from '@vueye-table/vue'
import { defineAsyncComponent, type VNodeChild } from 'vue'

import type { TableCellContext } from '@/composables/table-columns'

const props = withDefaults(
  defineProps<{
    table: DataTableBinding<TData>
    emptyText?: string
    loading?: boolean
    loadingText?: string
    ariaLabel?: string
    showToolbar?: boolean
    showSearch?: boolean
    searchPlaceholder?: string
    showColumnFilters?: boolean | null
    showColumnVisibility?: boolean
    showFooter?: boolean
    showPagination?: boolean
    selectable?: boolean
    expandable?: boolean
    virtual?: boolean
    virtualRowHeight?: number
    maxBodyHeight?: number | string
    pageSizeOptions?: number[]
    totalRows?: number
    error?: boolean
    embedded?: boolean
    /** Server bindings do not expose their construction options. */
    manual?: boolean
  }>(),
  {
    loading: false,
    error: false,
    ariaLabel: 'Data grid',
    showToolbar: true,
    showSearch: true,
    showColumnFilters: null,
    showColumnVisibility: true,
    showFooter: true,
    showPagination: true,
    selectable: false,
    expandable: false,
    virtual: false,
    virtualRowHeight: 52,
    maxBodyHeight: '32rem',
    pageSizeOptions: () => [10, 25, 50, 100],
    totalRows: undefined,
    embedded: false,
    manual: false,
  },
)

const emit = defineEmits<{ retry: [] }>()
const slots = defineSlots<
  Partial<Record<`cell-${string}`, (props: TableCellContext<TData>) => VNodeChild>> & {
    'expanded-row'?: (props: {
      row: TData
      rowKey: RowKey
      tableRow: TableRow<TData>
    }) => VNodeChild
  }
>()
const cellSlotNames = computed(
  () => Object.keys(slots).filter((name) => name.startsWith('cell-')) as `cell-${string}`[],
)
const Renderer = defineAsyncComponent(() => import('./table/NativeDataGrid.vue'))
</script>

<template>
  <Renderer v-bind="props" @retry="emit('retry')">
    <template v-for="name in cellSlotNames" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps as TableCellContext<TData>" />
    </template>
    <template v-if="slots['expanded-row']" #expanded-row="slotProps">
      <slot
        name="expanded-row"
        v-bind="slotProps as { row: TData; rowKey: RowKey; tableRow: TableRow<TData> }"
      />
    </template>
  </Renderer>
</template>
