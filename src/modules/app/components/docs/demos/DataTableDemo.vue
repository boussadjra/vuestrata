<script setup lang="ts">
import { useDataTable, type ColumnDef } from '@/composables/useDataTable'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  status: string
}

const data: TeamMember[] = [
  { id: '1', name: 'Ada Lovelace', email: 'ada@analytical.dev', role: 'Admin', status: 'Active' },
  {
    id: '2',
    name: 'Grace Hopper',
    email: 'grace@compiler.dev',
    role: 'Member',
    status: 'Reviewing',
  },
  {
    id: '3',
    name: 'Margaret Hamilton',
    email: 'margaret@apollo.dev',
    role: 'Owner',
    status: 'Active',
  },
]

const columns: ColumnDef<TeamMember>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'role', header: 'Role' },
  { accessorKey: 'status', header: 'Status' },
]

const { table, globalFilter, totalRows } = useDataTable({
  data,
  columns,
  pageSize: 5,
})

const summary = computed(() => `${totalRows.value} team members loaded`)
</script>

<template>
  <UiCard>
    <template #header>
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 class="text-surface-900 text-lg font-bold dark:text-white">Data table preview</h3>
          <p class="text-surface-500 dark:text-surface-400 mt-1 text-sm">
            Filtering and table state from the same composable used in the app.
          </p>
        </div>
        <div class="w-full md:w-72">
          <UiTextField v-model="globalFilter" placeholder="Filter team members" />
        </div>
      </div>
    </template>

    <UiDataTable :table="table" />

    <template #footer>
      <div class="text-surface-500 dark:text-surface-400 text-sm">{{ summary }}</div>
    </template>
  </UiCard>
</template>
