<script setup lang="ts">
import ComponentApiTable from '@/components/docs/ComponentApiTable.vue'
import type { ApiPropRow, ApiEventRow, ApiSlotRow } from '@/components/docs/ComponentApiTable.vue'
import ComponentDemo from '@/components/docs/ComponentDemo.vue'
import ComponentPlayground from '@/components/docs/ComponentPlayground.vue'
import type { PropDef } from '@/components/docs/ComponentPlayground.vue'
import ComponentTestRunner from '@/components/docs/ComponentTestRunner.vue'
import { teamMembers, type TeamMember } from '@/components/docs/demos/data-table-fixtures'
import DataTableEmptyDemo from '@/components/docs/demos/DataTableEmptyDemo.vue'
import DataTableErrorDemo from '@/components/docs/demos/DataTableErrorDemo.vue'
import DataTableMinimalDemo from '@/components/docs/demos/DataTableMinimalDemo.vue'
import DataTablePublicApiDemo from '@/components/docs/demos/DataTablePublicApiDemo.vue'
import DataTableRichDemo from '@/components/docs/demos/DataTableRichDemo.vue'
import DataTableSelectionDemo from '@/components/docs/demos/DataTableSelectionDemo.vue'
import DataTableServerDemo from '@/components/docs/demos/DataTableServerDemo.vue'
import DataTableTreeDemo from '@/components/docs/demos/DataTableTreeDemo.vue'
import DataTableTypedCellsDemo from '@/components/docs/demos/DataTableTypedCellsDemo.vue'
import DataTableVirtualDemo from '@/components/docs/demos/DataTableVirtualDemo.vue'
import { createColumns, useDataTable } from '@/composables/useDataTable'

const playgroundCol = createColumns<TeamMember>()
const playgroundColumns = [
  playgroundCol.text('name', {
    label: 'Name',
    filter: { variant: 'text', placeholder: 'Filter people' },
  }),
  playgroundCol.text('role', { label: 'Role' }),
  playgroundCol.text('status', { label: 'Status' }),
]

const { table: playgroundTable } = useDataTable({
  data: teamMembers,
  columns: playgroundColumns,
  enableFiltering: true,
  enablePagination: true,
  enableRowSelection: true,
  enableColumnVisibility: true,
  enableExpanding: true,
  pageSize: 5,
  getRowId: (row) => row.id,
  getRowCanExpand: (row) => Boolean(row.original.notes),
})

const propDefs: PropDef[] = [
  { name: 'loading', type: 'boolean', default: false },
  { name: 'showToolbar', type: 'boolean', default: true },
  { name: 'showColumnFilters', type: 'boolean', default: true },
  { name: 'showColumnVisibility', type: 'boolean', default: true },
  { name: 'showPagination', type: 'boolean', default: true },
  { name: 'virtual', type: 'boolean', default: false },
]

const richUsageCode = `const col = createColumns<TeamMember>()
const columns = [
  col.text('name', {
    label: 'Name',
    filter: { variant: 'text', placeholder: 'Filter team members' },
  }),
  col.text('role', {
    label: 'Role',
    filter: {
      variant: 'select',
      options: [
        { label: 'Admin', value: 'Admin' },
        { label: 'Member', value: 'Member' },
      ],
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
  enableExpanding: true,
  getRowCanExpand: (row) => Boolean(row.original.notes),
})

// <UiDataGrid :table="table" selectable expandable />`

const lowLevelCode = `const columns: ColumnDef<Task>[] = [
  { accessorKey: 'id', header: '#' },
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'priority', header: 'Priority' },
]

const { table } = useDataTable({ data: rows, columns })

// <UiDataTable :table="table" />`

const serverCode = `const col = createColumns<Row>()
const columns = [
  col.text('workspace', { label: 'Workspace' }),
  col.text('owner', { label: 'Owner' }),
]

const { table, isLoading, isError, refetch } = useServerTable({
  columns,
  query: useWorkspacesQuery,
})

// <UiDataGrid :table="table" :loading="isLoading" :error="isError" @retry="refetch" />`

const typedCellsCode = `const col = createColumns<Invoice>()
const columns = [
  col.link('customer', {
    label: 'Customer',
    to: (row) => \`/dashboard/orders/\${row.id}\`,
    sublabel: (row) => row.email,
  }),
  col.status('status', {
    label: 'Status',
    variant: invoiceStatusVariant,
    labelFor: invoiceStatusLabel,
  }),
  col.money('total', { label: 'Total' }),
  col.date('issuedAt', { label: 'Issued' }),
]

const { table } = useDataTable({ data: invoices, columns })`

const selectionCode = `const { table, selectedRows } = useDataTable({
  data: directory,
  columns,
  enableRowSelection: true,
})

// <UiDataGrid :table="table" selectable />`

const treeCode = `const { table } = useDataTable({
  data: orgTree,
  columns,
  enableExpanding: true,
  getRowId: (row) => row.id,
  getSubRows: (row) => row.team,
})

// <UiDataGrid :table="table" expandable />`

const virtualCode = `const { table } = useDataTable({
  data: makeLogRows(220),
  columns,
  enablePagination: false,
})

// <UiDataGrid :table="table" virtual max-body-height="20rem" />`

const emptyCode = `<UiDataGrid :table="emptyTable" empty-text="No records found." />`

const errorCode = `<UiDataGrid :table="table" :error="failed" @retry="retry" />`

const publicApiCode = `const rows = ref<DirectoryUser[]>([])

const { table } = useDataTable({
  data: () => rows.value,
  columns,
  getRowId: (row) => String(row.id),
})

async function load() {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/users')
    rows.value = await response.json()
  } catch {
    rows.value = localFallback
  }
}`

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
    default: '!manualFiltering',
    description:
      'Shows per-column filter affordances derived from column metadata. Defaults off for server-backed (manualFiltering) tables.',
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
    name: 'error',
    type: 'boolean',
    default: 'false',
    description:
      'Replaces the table body with an error empty state. Distinct from an empty result set.',
  },
  {
    name: 'totalRows',
    type: 'number',
    description: 'Optional total row count override. Server tables usually omit this.',
  },
]

const dataGridEvents: ApiEventRow[] = [
  {
    name: 'retry',
    payload: '—',
    description: 'Emitted when the error-state retry control is activated.',
  },
]

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
        <DataTableRichDemo />
      </ComponentDemo>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Low-level Renderer</h2>
      <p class="text-muted-foreground text-sm">
        Keep <code>UiDataTable</code> when the page owns its own toolbar and table chrome.
      </p>
      <ComponentDemo :code="lowLevelCode">
        <DataTableMinimalDemo />
      </ComponentDemo>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Server-side Query State</h2>
      <p class="text-muted-foreground text-sm">
        <code>useServerTable</code> binds a collection query to the grid. Do not wire
        <code>useDataTable</code> to a query by hand — the two are mutually dependent and crash on
        load.
      </p>
      <ComponentDemo :code="serverCode">
        <DataTableServerDemo />
      </ComponentDemo>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Typed Cells</h2>
      <p class="text-muted-foreground text-sm">
        <code>createColumns</code> helpers for link, status, money, and date. Invoice totals use the
        shared <code>Money</code> type (minor units).
      </p>
      <ComponentDemo :code="typedCellsCode">
        <DataTableTypedCellsDemo />
      </ComponentDemo>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Row Selection</h2>
      <p class="text-muted-foreground text-sm">
        Enable selection in <code>useDataTable</code> and pass <code>selectable</code>.
        <code>selectedRows</code> is the current subset.
      </p>
      <ComponentDemo :code="selectionCode">
        <DataTableSelectionDemo />
      </ComponentDemo>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Tree Rows</h2>
      <p class="text-muted-foreground text-sm">
        Nested records through <code>getSubRows</code> and a stable <code>getRowId</code>.
      </p>
      <ComponentDemo :code="treeCode">
        <DataTableTreeDemo />
      </ComponentDemo>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Virtual Rows</h2>
      <p class="text-muted-foreground text-sm">
        Flat-row virtualization for long in-memory lists. Expanded detail rows and tree rows fall
        back to the non-virtual renderer.
      </p>
      <ComponentDemo :code="virtualCode">
        <DataTableVirtualDemo />
      </ComponentDemo>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Empty State</h2>
      <p class="text-muted-foreground text-sm">
        An empty result set is not an error. The grid says so with
        <code>empty-text</code>.
      </p>
      <ComponentDemo :code="emptyCode">
        <DataTableEmptyDemo />
      </ComponentDemo>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Error And Retry</h2>
      <p class="text-muted-foreground text-sm">
        Pass <code>:error</code> and listen for <code>@retry</code>. Showing “no rows match” for a
        failed request tells the user their filters are wrong when the data is simply unknown.
      </p>
      <ComponentDemo :code="errorCode">
        <DataTableErrorDemo />
      </ComponentDemo>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Public API Directory</h2>
      <p class="text-muted-foreground text-sm">
        Ten people from
        <a
          class="text-link hover:text-link-hover hover:underline"
          href="https://jsonplaceholder.typicode.com/users"
          rel="noreferrer"
          target="_blank"
          >jsonplaceholder.typicode.com/users</a
        >. If the request fails, the grid keeps a local 10-row fallback so the demo still works
        offline.
      </p>
      <ComponentDemo :code="publicApiCode">
        <DataTablePublicApiDemo />
      </ComponentDemo>
    </section>

    <section class="space-y-4">
      <h2 class="text-xl font-semibold">Playground</h2>
      <ComponentPlayground :prop-defs="propDefs">
        <template #default="{ props: p }">
          <UiDataGrid :table="playgroundTable" selectable expandable v-bind="p">
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
        <UiDataGrid :table="playgroundTable" selectable expandable>
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
