<script setup lang="ts">
import { createColumnHelper } from '@tanstack/vue-table'

import { useDataTable } from '@/composables/useDataTable'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  status: string
  notes?: string
}

const data: TeamMember[] = [
  {
    id: '1',
    name: 'Ada Lovelace',
    email: 'ada@analytical.dev',
    role: 'Admin',
    status: 'Active',
    notes: 'Owns release templates and final QA signoff for internal starter updates.',
  },
  {
    id: '2',
    name: 'Grace Hopper',
    email: 'grace@compiler.dev',
    role: 'Member',
    status: 'Reviewing',
    notes: 'Reviewing the new table filters before the next internal rollout.',
  },
  {
    id: '3',
    name: 'Margaret Hamilton',
    email: 'margaret@apollo.dev',
    role: 'Owner',
    status: 'Active',
  },
]

const helper = createColumnHelper<TeamMember>()
const columns = [
  helper.accessor('name', {
    header: 'Name',
    meta: {
      label: 'Name',
      filter: {
        variant: 'text',
        placeholder: 'Filter team members',
      },
    },
  }),
  helper.accessor('email', {
    header: 'Email',
    meta: {
      label: 'Email',
      filter: {
        variant: 'text',
        placeholder: 'Filter email',
      },
    },
  }),
  helper.accessor('role', {
    header: 'Role',
    meta: {
      label: 'Role',
      filter: {
        variant: 'select',
        options: [
          { label: 'Admin', value: 'Admin' },
          { label: 'Member', value: 'Member' },
          { label: 'Owner', value: 'Owner' },
        ],
      },
    },
  }),
  helper.accessor('status', {
    header: 'Status',
    meta: {
      label: 'Status',
      filter: {
        variant: 'select',
        options: [
          { label: 'Active', value: 'Active' },
          { label: 'Reviewing', value: 'Reviewing' },
        ],
      },
    },
  }),
]

const { table, totalRows, selectedRows } = useDataTable({
  data,
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
  <UiCard>
    <template #header>
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 class="text-surface-900 text-lg font-bold dark:text-white">Rich data grid preview</h3>
          <p class="text-muted-foreground mt-1 text-sm">
            Toolbar search, column filters, row selection, and expandable details from the same
            TanStack state contract.
          </p>
        </div>
      </div>
    </template>

    <UiDataGrid :table="table" selectable expandable>
      <template #expanded-row="{ row }">
        <div class="space-y-1">
          <p class="text-foreground text-sm font-semibold">
            {{ row.original.name }}
          </p>
          <p class="text-muted-foreground text-sm">
            {{ row.original.notes ?? 'No extra notes for this team member.' }}
          </p>
        </div>
      </template>
    </UiDataGrid>

    <template #footer>
      <div class="text-muted-foreground text-sm">{{ summary }}</div>
    </template>
  </UiCard>
</template>
