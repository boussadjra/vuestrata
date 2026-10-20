<script setup lang="ts">
import { useDataTable, type ColumnDef } from '@/composables/useDataTable'

import { tasks, type TaskRow } from './data-table-fixtures'

const columns: ColumnDef<TaskRow>[] = [
  { id: 'id', header: '#' },
  { id: 'title', header: 'Title' },
  { id: 'priority', header: 'Priority' },
]

const { table } = useDataTable({ data: tasks, columns })
</script>

<template>
  <div class="max-w-lg">
    <UiDataTable :table="table" empty-text="No tasks to display." />
  </div>
</template>
