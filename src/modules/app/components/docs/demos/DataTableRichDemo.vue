<script setup lang="ts">
import { createColumns, useDataTable } from '@/composables/useDataTable'

import { teamMembers, type TeamMember } from './data-table-fixtures'

const col = createColumns<TeamMember>()
const columns = [
  col.text('name', {
    label: 'Name',
    filter: { variant: 'text', placeholder: 'Filter team members' },
  }),
  col.text('email', {
    label: 'Email',
    filter: { variant: 'text', placeholder: 'Filter email' },
  }),
  col.text('role', {
    label: 'Role',
    filter: {
      variant: 'select',
      options: [
        { label: 'Admin', value: 'Admin' },
        { label: 'Member', value: 'Member' },
        { label: 'Owner', value: 'Owner' },
      ],
    },
  }),
  col.text('status', {
    label: 'Status',
    filter: {
      variant: 'select',
      options: [
        { label: 'Active', value: 'Active' },
        { label: 'Reviewing', value: 'Reviewing' },
      ],
    },
  }),
]

const { table, totalRows, selectedRows } = useDataTable({
  data: teamMembers,
  columns,
  pageSize: 5,
  enableFiltering: true,
  enablePagination: true,
  enableRowSelection: true,
  enableColumnVisibility: true,
  enableExpanding: true,
  getRowId: (row) => row.id,
  getRowCanExpand: (row) => Boolean(row.original.notes),
})

const summary = computed(() => {
  const selectedSummary = selectedRows.value.length
    ? ` · ${selectedRows.value.length} selected`
    : ''
  return `${totalRows.value} team members loaded${selectedSummary}`
})
</script>

<template>
  <div class="space-y-3">
    <UiDataGrid :table="table" selectable expandable aria-label="Team members">
      <template #expanded-row="{ row }">
        <div class="space-y-1">
          <p class="text-foreground text-sm font-semibold">{{ row.original.name }}</p>
          <p class="text-muted-foreground text-sm">
            {{ row.original.notes ?? 'No extra notes for this team member.' }}
          </p>
        </div>
      </template>
    </UiDataGrid>
    <p class="text-muted-foreground text-sm">{{ summary }}</p>
  </div>
</template>
