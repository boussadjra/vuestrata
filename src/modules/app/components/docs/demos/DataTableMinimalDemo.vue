<script setup lang="ts">
import { useDataTable, type ColumnDef } from '@/composables/useDataTable'

import { tasks, type TaskRow } from './data-table-fixtures'

const columns: ColumnDef<TaskRow>[] = [
  { accessorKey: 'id', header: '#' },
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'priority', header: 'Priority' },
]

const { table } = useDataTable({ data: tasks, columns })
</script>

<template>
  <div class="max-w-lg">
    <UiDataTable :table="table" empty-text="No tasks to display." />
  </div>
</template>
