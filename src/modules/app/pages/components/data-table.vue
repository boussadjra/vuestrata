<script setup lang="ts">
import { createColumnHelper } from '@tanstack/vue-table'

import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow, ApiSlotRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'
import DataTableServerDemo from '@/components/docs/demos/DataTableServerDemo.vue'
import { useDataTable, type ColumnDef } from '@/composables/useDataTable'

interface Person {
  id: string
  name: string
  role: string
  status: string
  score: number
  notes?: string
}

interface Task {
  id: number
  title: string
  priority: string
}

const helper = createColumnHelper<Person>()
const personColumns = [
  helper.accessor('name', {
    header: 'Name',
    meta: {
      label: 'Name',
      filter: {
        variant: 'text',
        placeholder: 'Filter people',
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
          { label: 'Designer', value: 'Designer' },
          { label: 'Engineer', value: 'Engineer' },
          { label: 'Product', value: 'Product' },
          { label: 'DevOps', value: 'DevOps' },
          { label: 'QA', value: 'QA' },
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
          { label: 'Review', value: 'Review' },
          { label: 'Blocked', value: 'Blocked' },
        ],
      },
    },
  }),
  helper.accessor('score', {
    header: 'Score',
    meta: {
      label: 'Score',
      align: 'end',
    },
  }),
] satisfies ColumnDef<Person>[]

const rows: Person[] = [
  {
    id: 'p-1',
    name: 'Lina K.',
    role: 'Designer',
    status: 'Active',
    score: 94,
    notes: 'Owns the design-system pass for the next release candidate.',
  },
  {
    id: 'p-2',
    name: 'Marvin P.',
    role: 'Engineer',
    status: 'Review',
    score: 88,
    notes: 'Reviewing the server-side query contract for the new grid.',
  },
  {
    id: 'p-3',
    name: 'Nadia S.',
    role: 'Product',
    status: 'Blocked',
    score: 72,
  },
  {
    id: 'p-4',
    name: 'Oscar T.',
    role: 'DevOps',
    status: 'Active',
    score: 91,
    notes: 'Validating production build size and rollout toggles.',
  },
  {
    id: 'p-5',
    name: 'Priya R.',
    role: 'QA',
    status: 'Active',
    score: 85,
  },
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

const richTableState = useDataTable({
  data: rows,
  columns: personColumns,
  enableFiltering: true,
  enablePagination: true,
  enableRowSelection: true,
  enableColumnVisibility: true,
  enableExpanding: true,
  pageSize: 3,
  getRowId: (row) => row.id,
  getRowCanExpand: (row) => Boolean(row.original.notes),
})

const { table: richTable } = richTableState
const { table: minimalTable } = useDataTable({ data: minimalRows, columns: taskColumns })
const { table: emptyTable } = useDataTable({ data: [] as Person[], columns: personColumns })

const playgroundValue = ref(false)

const propDefs: PropDef[] = [
  { name: 'loading', type: 'boolean', default: false },
  { name: 'showToolbar', type: 'boolean', default: true },
  { name: 'showColumnFilters', type: 'boolean', default: true },
  { name: 'showColumnVisibility', type: 'boolean', default: true },
  { name: 'showPagination', type: 'boolean', default: true },
  { name: 'virtual', type: 'boolean', default: false },
]

const richUsageCode = `const helper = createColumnHelper<Person>()
const columns = [
  helper.accessor('name', {
    header: 'Name',
    meta: { label: 'Name', filter: { variant: 'text', placeholder: 'Filter people' } },
  }),
  helper.accessor('role', {
    header: 'Role',
    meta: {
      label: 'Role',
      filter: {
        variant: 'select',
        options: [
          { label: 'Designer', value: 'Designer' },
          { label: 'Engineer', value: 'Engineer' },
        ],
      },
    },
  }),
]

const { table } = useDataTable({
  data: rows,
  columns,
  enableFiltering: true,
  enablePagination: true,
  enableRowSelection: true,
  enableColumnVisibility: true,
})

// <UiDataGrid :table="table" selectable />`

const lowLevelCode = `const columns: ColumnDef<Task>[] = [
  { accessorKey: 'id', header: '#' },
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'priority', header: 'Priority' },
]

const { table } = useDataTable({ data: rows, columns })

// <UiDataTable :table="table" />`

const serverCode = `const serverRows = ref<Row[]>([])
const serverMeta = ref<{ total: number; totalPages: number } | null>(null)

const { table, queryState } = useDataTable({
  data: () => serverRows.value,
  columns,
  manualPagination: true,
  manualFiltering: true,
  manualSorting: true,
  rowCount: () => serverMeta.value?.total,
  pageCount: () => serverMeta.value?.totalPages,
})

const query = useQuery({
  queryKey: computed(() => ['server-table-demo', queryState.value]),
  queryFn: async () => fetchServerPage(queryState.value),
})

watchEffect(() => {
  serverRows.value = query.data.value?.rows ?? []
  serverMeta.value = query.data.value
    ? { total: query.data.value.total, totalPages: query.data.value.totalPages }
    : null
})

// <UiDataGrid :table="table" :total-rows="serverMeta?.total" />`

const emptyCode = `<UiDataGrid :table="emptyTable" empty-text="No records found." />`

const dataGridProps: ApiPropRow[] = [
  {
    name: 'table',
    type: 'Table<TData>',
    default: '—',
    description: 'TanStack Table instance returned by useDataTable().',
  },
  {
    name: 'selectable',
    type: 'boolean',
    default: 'false',
    description: 'Renders built-in row selection controls.',
  },
  {
    name: 'expandable',
    type: 'boolean',
    default: 'false',
    description: 'Renders expand toggles for rows that can expand.',
  },
  {
    name: 'showColumnFilters',
    type: 'boolean',
    default: 'true',
    description: 'Shows per-column filter affordances derived from column metadata.',
  },
  {
    name: 'showColumnVisibility',
    type: 'boolean',
    default: 'true',
    description: 'Shows the column visibility popover.',
  },
  {
    name: 'virtual',
    type: 'boolean',
    default: 'false',
    description:
      'Enables flat-row virtualization when the table does not use tree rows or expanded detail rows.',
  },
  {
    name: 'totalRows',
    type: 'number',
    description: 'Optional total row count override for manual server-side tables.',
  },
]

const dataGridEvents: ApiEventRow[] = []

const dataGridSlots: ApiSlotRow[] = [
  {
    name: 'expanded-row',
    props: '{ row: Row<TData> }',
    description: 'Rendered beneath an expanded row when expandable mode is enabled.',
  },
]

const dataTableProps: ApiPropRow[] = [
  {
    name: 'table',
    type: 'Table<TData>',
    default: '—',
    description: 'TanStack Table instance from useDataTable().',
  },
  { name: 'emptyText', type: 'string', description: 'Text shown when the table has no rows.' },
]

const dataTableEvents: ApiEventRow[] = []

const dataTableSlots: ApiSlotRow[] = []
</script>

<template>
  <div class="space-y-12">
    <header>
      <h1 class="mb-2 text-3xl font-bold">Data Tables</h1>
      <p class="text-muted-foreground text-lg">
        Use <code>UiDataGrid</code> for rich exploration workflows and <code>UiDataTable</code> when
        you only need a semantic table renderer for an existing TanStack instance.
      </p>
    </header>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Rich Grid</h2>
      <p class="text-muted-foreground text-sm">
        Built-in search, filters, selection, column visibility, pagination, and expandable detail
        rows.
      </p>
      <ComponentDemo :code="richUsageCode">
        <UiDataGrid :table="richTable" selectable expandable>
          <template #expanded-row="{ row }">
            <div class="space-y-1">
              <p class="text-foreground text-sm font-semibold">
                {{ row.original.name }}
              </p>
              <p class="text-muted-foreground text-sm">
                {{ row.original.notes ?? 'No extra context for this row.' }}
              </p>
            </div>
          </template>
        </UiDataGrid>
      </ComponentDemo>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Low-level Renderer</h2>
      <p class="text-muted-foreground text-sm">
        Keep <code>UiDataTable</code> when the page owns its own toolbar and table chrome.
      </p>
      <ComponentDemo :code="lowLevelCode">
        <div class="max-w-lg">
          <UiDataTable :table="minimalTable" />
        </div>
      </ComponentDemo>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Server-side Query State</h2>
      <p class="text-muted-foreground text-sm">
        Manual sorting, filtering, and pagination stay in <code>useDataTable()</code>, while
        TanStack Query reacts to <code>queryState</code> outside the grid.
      </p>
      <ComponentDemo :code="serverCode">
        <DataTableServerDemo />
      </ComponentDemo>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Empty State</h2>
      <ComponentDemo :code="emptyCode">
        <UiDataGrid :table="emptyTable" empty-text="No records found." />
      </ComponentDemo>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiDataGrid :table="richTable" selectable expandable v-bind="p">
            <template #expanded-row="{ row }">
              <div class="space-y-1">
                <p class="text-foreground text-sm font-semibold">
                  {{ row.original.name }}
                </p>
                <p class="text-muted-foreground text-sm">
                  {{ row.original.notes ?? 'No extra context for this row.' }}
                </p>
              </div>
            </template>
          </UiDataGrid>
        </template>
      </ComponentPlayground>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Accessibility</h2>
      <ComponentTestRunner>
        <UiDataGrid :table="richTable" selectable expandable>
          <template #expanded-row="{ row }">
            <div class="space-y-1">
              <p class="text-foreground text-sm font-semibold">
                {{ row.original.name }}
              </p>
              <p class="text-muted-foreground text-sm">
                {{ row.original.notes ?? 'No extra context for this row.' }}
              </p>
            </div>
          </template>
        </UiDataGrid>
      </ComponentTestRunner>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">UiDataGrid API</h2>
      <ComponentApiTable :props="dataGridProps" :events="dataGridEvents" :slots="dataGridSlots" />
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">UiDataTable API</h2>
      <ComponentApiTable
        :props="dataTableProps"
        :events="dataTableEvents"
        :slots="dataTableSlots"
      />
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: components
</route>
