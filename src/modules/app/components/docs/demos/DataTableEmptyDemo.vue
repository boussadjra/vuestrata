<script setup lang="ts">
import { createColumns, useDataTable } from '@/composables/useDataTable'

import type { TeamMember } from './data-table-fixtures'

const col = createColumns<TeamMember>()
const columns = [
  col.text('name', { label: 'Name' }),
  col.text('email', { label: 'Email' }),
  col.text('role', { label: 'Role' }),
]

const { table } = useDataTable({
  data: [] as TeamMember[],
  columns,
  getRowId: (row) => row.id,
})
</script>

<template>
  <UiDataGrid :table="table" empty-text="No records found." aria-label="Empty results" />
</template>
