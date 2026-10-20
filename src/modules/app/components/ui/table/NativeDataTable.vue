<script setup lang="ts">
import type { TableRow } from '@vueye-table/core'
import {
  DataTableBody,
  DataTableCell,
  DataTableHeader,
  DataTableHeaderCell,
  DataTableHeaderRow,
  DataTableRoot,
  DataTableRow,
} from '@vueye-table/headless'
import { provideTableLocale, type AnyDataTableBinding } from '@vueye-table/vue'
import { useI18n } from 'vue-i18n'

import { TableCellContent } from '@/composables/table-columns'
import { intlLocale } from '@/plugins/appearance'
import { resolveIcon } from '~/config/icon-provider'

type TData = unknown

const props = defineProps<{
  table: AnyDataTableBinding
  emptyText?: string
  ariaLabel?: string
}>()
const { t, locale } = useI18n()
provideTableLocale(() => ({
  locale: intlLocale(locale.value),
  messages: {
    loading: t('common_loading'),
    loadingRows: t('common_loading'),
    loadingMoreRows: t('common_loading'),
    loadingChildren: t('common_loading'),
    childrenError: t('common_error_body'),
    retryChildren: t('common_retry'),
    expandRow: t('common_expand_row'),
    collapseRow: t('common_collapse_row'),
  },
}))
const bindingVersion = ref(0)
watch(
  () => props.table,
  () => {
    bindingVersion.value += 1
  },
)
function typedRow(row: TableRow<unknown>) {
  return row as TableRow<TData>
}
</script>

<template>
  <div
    class="border-border overflow-x-auto rounded-xl border"
    data-ui="datatable"
    data-provider="vueye"
  >
    <DataTableRoot
      :key="bindingVersion"
      :table="table"
      class="min-w-full border-collapse text-sm"
      :aria-label="ariaLabel"
    >
      <DataTableHeader class="bg-muted"
        ><DataTableHeaderRow
          ><DataTableHeaderCell
            v-for="column in table.columns"
            :key="column.id"
            :column="column"
            class="border-border text-foreground border-b px-3 py-2 text-start"
            ><button
              v-if="column.sortable"
              type="button"
              class="flex items-center gap-1"
              @click="table.toggleSort(column.id, { multi: $event.shiftKey })"
            >
              {{ column.header
              }}<span
                v-if="table.getSort(column.id)"
                :class="[
                  resolveIcon(
                    table.getSort(column.id)?.direction === 'asc' ? 'arrow-up' : 'arrow-down',
                  ),
                  'h-3.5 w-3.5',
                ]"
              /></button
            ><span v-else>{{ column.header }}</span></DataTableHeaderCell
          ></DataTableHeaderRow
        ></DataTableHeader
      >
      <DataTableBody>
        <template #row="{ row, rowIndex }"
          ><DataTableRow :row="row" :row-index="rowIndex" class="odd:bg-card even:bg-muted/40"
            ><DataTableCell
              v-for="column in table.columns"
              :key="column.id"
              :row="row"
              :column="column"
              class="border-border border-b px-3 py-2"
              ><slot
                :name="`cell-${column.id}`"
                :row="typedRow(row).original"
                :value="row.getValue(column.id)"
                :column="column"
                :row-key="row.key"
                ><TableCellContent
                  :row="typedRow(row)"
                  :column="column" /></slot></DataTableCell></DataTableRow
        ></template>
        <template #empty
          ><span class="text-muted-foreground block px-3 py-6 text-center">{{
            emptyText ?? t('common_no_results')
          }}</span></template
        >
      </DataTableBody>
    </DataTableRoot>
  </div>
</template>
