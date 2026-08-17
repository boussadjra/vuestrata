<script setup lang="ts">
import { createColumns, useDataTable } from '@/composables/useDataTable'

import { teamMembers, type TeamMember } from './data-table-fixtures'

const failed = ref(true)

const col = createColumns<TeamMember>()
const columns = [
  col.text('name', { label: 'Name' }),
  col.text('email', { label: 'Email' }),
  col.text('role', { label: 'Role' }),
]

const { table } = useDataTable({
  data: teamMembers,
  columns,
  getRowId: (row) => row.id,
})

function retry(): void {
  failed.value = false
}

function simulateFailure(): void {
  failed.value = true
}
</script>

<template>
  <div class="space-y-3">
    <UiButton v-if="!failed" size="sm" variant="ghost" @click="simulateFailure">
      Simulate failure
    </UiButton>
    <UiDataGrid
      :table="table"
      :error="failed"
      aria-label="Team members"
      empty-text="No team members."
      @retry="retry"
    />
  </div>
</template>
