<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow, ApiSlotRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'
import { useDataTable, type ColumnDef } from '@/composables/useDataTable'

interface Person {
  name: string
  role: string
  status: string
  score: number
}

interface Task {
  id: number
  title: string
  priority: string
}

const personColumns: ColumnDef<Person>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'role', header: 'Role' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'score', header: 'Score' },
]

const rows: Person[] = [
  { name: 'Lina K.', role: 'Designer', status: 'Active', score: 94 },
  { name: 'Marvin P.', role: 'Engineer', status: 'Review', score: 88 },
  { name: 'Nadia S.', role: 'Product', status: 'Blocked', score: 72 },
  { name: 'Oscar T.', role: 'DevOps', status: 'Active', score: 91 },
  { name: 'Priya R.', role: 'QA', status: 'Active', score: 85 },
]

const taskColumns: ColumnDef<Task>[] = [
  { accessorKey: 'id', header: '#' },
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'priority', header: 'Priority' },
]

const minimalRows: Task[] = [
  { id: 1, title: 'Fix login bug', priority: 'High' },
  { id: 2, title: 'Add dark mode', priority: 'Medium' },
  { id: 3, title: 'Update docs', priority: 'Low' },
]

const { table: mainTable } = useDataTable({
  data: rows,
  columns: personColumns,
  enableSorting: true,
})
const { table: minimalTable } = useDataTable({ data: minimalRows, columns: taskColumns })
const { table: emptyTable } = useDataTable({ data: [] as Person[], columns: personColumns })

const propDefs: PropDef[] = [{ name: 'emptyText', type: 'string', default: '' }]

const usageCode = `const columns: ColumnDef<Person>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'role', header: 'Role' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'score', header: 'Score' },
]
const { table } = useDataTable({ data: rows, columns })
// <UiDataTable :table="table" />`

const minimalCode = `const columns: ColumnDef<Task>[] = [
  { accessorKey: 'id', header: '#' },
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'priority', header: 'Priority' },
]
const { table } = useDataTable({ data: rows, columns })
// <UiDataTable :table="table" />`

const emptyCode = `<UiDataTable :table="emptyTable" empty-text="No records found." />`

const apiProps: ApiPropRow[] = [
  {
    name: 'table',
    type: 'Table<any>',
    default: '—',
    description: 'TanStack Table instance from useDataTable()',
  },
  { name: 'emptyText', type: 'string', description: 'Text shown when table has no rows' },
]

const apiEvents: ApiEventRow[] = []

const apiSlots: ApiSlotRow[] = []
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">DataTable</h1>
      <p class="text-surface-500 dark:text-surface-400 text-lg">
        Tabular data powered by TanStack Table with sorting, filtering, and pagination.
      </p>
    </header>

    <!-- Usage -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Usage</h2>
      <ComponentDemo :code="usageCode">
        <UiDataTable :table="mainTable" />
      </ComponentDemo>
    </section>

    <!-- Minimal -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Minimal Table</h2>
      <ComponentDemo :code="minimalCode">
        <div class="max-w-lg">
          <UiDataTable :table="minimalTable" />
        </div>
      </ComponentDemo>
    </section>

    <!-- Empty State -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Empty State</h2>
      <ComponentDemo :code="emptyCode">
        <UiDataTable :table="emptyTable" empty-text="No records found." />
      </ComponentDemo>
    </section>

    <!-- Playground -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiDataTable :table="mainTable" v-bind="p" />
        </template>
      </ComponentPlayground>
    </section>

    <!-- Accessibility Audit -->
    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <UiDataTable :table="mainTable" />
      </ComponentTestRunner>
    </section>

    <!-- API Reference -->
    <ComponentApiTable :props="apiProps" :events="apiEvents" :slots="apiSlots" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: components
</route>
