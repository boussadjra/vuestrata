<script setup lang="ts" generic="TData extends RowData">
import { FlexRender, type RowData, type Table } from '@tanstack/vue-table'

defineProps<{
  table: Table<TData>
  emptyText?: string
}>()
</script>

<template>
  <div
    class="border-surface-200 dark:border-surface-700 overflow-x-auto rounded-xl border"
    data-ui="datatable"
    data-provider="reka"
  >
    <table class="min-w-full border-collapse text-sm">
      <thead class="bg-surface-100 dark:bg-surface-800">
        <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
          <th
            v-for="header in headerGroup.headers"
            :key="header.id"
            :colSpan="header.colSpan"
            class="border-surface-200 text-surface-700 dark:border-surface-700 dark:text-surface-300 border-b px-3 py-2 text-left"
            :class="{ 'cursor-pointer select-none': header.column.getCanSort() }"
            scope="col"
            @click="header.column.getToggleSortingHandler()?.($event)"
          >
            <div v-if="!header.isPlaceholder" class="flex items-center gap-1">
              <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
              <span v-if="header.column.getIsSorted() === 'asc'" class="text-xs">▲</span>
              <span v-else-if="header.column.getIsSorted() === 'desc'" class="text-xs">▼</span>
            </div>
          </th>
        </tr>
      </thead>
      <tbody v-if="table.getRowModel().rows.length">
        <tr
          v-for="row in table.getRowModel().rows"
          :key="row.id"
          class="even:bg-surface-50 dark:odd:bg-surface-900 dark:even:bg-surface-800/60 odd:bg-white"
        >
          <td
            v-for="cell in row.getVisibleCells()"
            :key="cell.id"
            class="border-surface-100 dark:border-surface-800 border-b px-3 py-2"
          >
            <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
          </td>
        </tr>
      </tbody>
      <tbody v-else>
        <tr>
          <td
            :colspan="table.getAllColumns().length"
            class="text-surface-500 px-3 py-6 text-center"
          >
            {{ emptyText ?? 'No rows to display.' }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
