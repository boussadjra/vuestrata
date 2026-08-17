<script setup lang="ts">
import { createColumns, useDataTable } from '@/composables/useDataTable'

import { directory, type DirectoryPerson } from './data-table-fixtures'

const col = createColumns<DirectoryPerson>()
const columns = [
  col.text('name', { label: 'Name', width: '14rem' }),
  col.text('title', { label: 'Title' }),
  col.text('location', { label: 'Location', width: '10rem' }),
]

const { table, selectedRows } = useDataTable({
  data: directory,
  columns,
  enableRowSelection: true,
  enablePagination: false,
  getRowId: (row) => row.id,
})

const selectedSummary = computed(() => {
  if (!selectedRows.value.length) return 'Select people to act on a subset of the directory.'
  return `${selectedRows.value.length} selected: ${selectedRows.value.map((row) => row.name).join(', ')}`
})
</script>

<template>
  <div class="space-y-3">
    <p class="text-muted-foreground text-sm">{{ selectedSummary }}</p>
    <UiDataGrid
      :table="table"
      selectable
      :show-pagination="false"
      aria-label="Directory"
      empty-text="No people in the directory."
    />
  </div>
</template>
