<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { createColumnHelper } from '@tanstack/vue-table'

import { useDataTable, type DataTableQueryState } from '@/composables/useDataTable'

interface WorkspaceRow {
  id: string
  workspace: string
  owner: string
  state: 'Active' | 'Review' | 'Blocked'
  seats: number
}

interface WorkspaceResult {
  rows: WorkspaceRow[]
  total: number
  totalPages: number
}

const sourceRows: WorkspaceRow[] = [
  { id: 'ws-1', workspace: 'Atlas', owner: 'Ada', state: 'Active', seats: 12 },
  { id: 'ws-2', workspace: 'Beacon', owner: 'Grace', state: 'Review', seats: 8 },
  { id: 'ws-3', workspace: 'Canopy', owner: 'Margaret', state: 'Active', seats: 22 },
  { id: 'ws-4', workspace: 'Drift', owner: 'Linus', state: 'Blocked', seats: 4 },
  { id: 'ws-5', workspace: 'Ember', owner: 'Priya', state: 'Active', seats: 16 },
  { id: 'ws-6', workspace: 'Foundry', owner: 'Nadia', state: 'Review', seats: 10 },
  { id: 'ws-7', workspace: 'Grain', owner: 'Oscar', state: 'Active', seats: 6 },
  { id: 'ws-8', workspace: 'Harbor', owner: 'Fatima', state: 'Blocked', seats: 18 },
  { id: 'ws-9', workspace: 'Ion', owner: 'Mina', state: 'Active', seats: 27 },
  { id: 'ws-10', workspace: 'Junction', owner: 'Samir', state: 'Review', seats: 9 },
]

const helper = createColumnHelper<WorkspaceRow>()
const columns = [
  helper.accessor('workspace', {
    header: 'Workspace',
    meta: {
      label: 'Workspace',
      width: '16rem',
    },
  }),
  helper.accessor('owner', {
    header: 'Owner',
    meta: {
      label: 'Owner',
      width: '10rem',
    },
  }),
  helper.accessor('state', {
    header: 'State',
    meta: {
      label: 'State',
      filter: {
        variant: 'select',
        options: [
          { label: 'Active', value: 'Active' },
          { label: 'Review', value: 'Review' },
          { label: 'Blocked', value: 'Blocked' },
        ],
      },
      width: '9rem',
    },
  }),
  helper.accessor('seats', {
    header: 'Seats',
    meta: {
      label: 'Seats',
      align: 'end',
      width: '7rem',
    },
  }),
]

const serverRows = ref<WorkspaceRow[]>([])
const serverMeta = ref<{ total: number; totalPages: number } | null>(null)

const { table, queryState } = useDataTable<WorkspaceRow>({
  data: () => serverRows.value,
  columns,
  enableFiltering: true,
  enablePagination: true,
  enableColumnVisibility: true,
  pageSize: 4,
  manualPagination: true,
  manualFiltering: true,
  manualSorting: true,
  rowCount: () => serverMeta.value?.total,
  pageCount: () => serverMeta.value?.totalPages,
  getRowId: (row) => row.id,
})

const serverQuery = useQuery({
  queryKey: computed(() => ['data-table-server-demo', queryState.value]),
  queryFn: async (): Promise<WorkspaceResult> => {
    const state = queryState.value
    let rows = [...sourceRows]
    const search = state.globalFilter.trim().toLowerCase()
    const stateFilter = state.columnFilters.find((filter) => filter.id === 'state')?.value
    const primarySort = state.sorting[0]

    if (search) {
      rows = rows.filter(
        (row) =>
          row.workspace.toLowerCase().includes(search) || row.owner.toLowerCase().includes(search),
      )
    }

    if (typeof stateFilter === 'string') {
      rows = rows.filter((row) => row.state === stateFilter)
    }

    if (primarySort) {
      const sortKey = primarySort.id as keyof WorkspaceRow
      rows = rows.toSorted((left, right) => {
        const leftValue = normalizeSortValue(left[sortKey])
        const rightValue = normalizeSortValue(right[sortKey])

        if (leftValue < rightValue) return primarySort.direction === 'asc' ? -1 : 1
        if (leftValue > rightValue) return primarySort.direction === 'asc' ? 1 : -1
        return 0
      })
    }

    const total = rows.length
    const start = state.pagination.pageIndex * state.pagination.pageSize
    const end = start + state.pagination.pageSize

    return {
      rows: rows.slice(start, end),
      total,
      totalPages: Math.max(1, Math.ceil(total / state.pagination.pageSize)),
    }
  },
})

serverRows.value = serverQuery.data.value?.rows ?? []
serverMeta.value = serverQuery.data.value
  ? {
      total: serverQuery.data.value.total,
      totalPages: serverQuery.data.value.totalPages,
    }
  : null

watchEffect(() => {
  serverRows.value = serverQuery.data.value?.rows ?? []
  serverMeta.value = serverQuery.data.value
    ? {
        total: serverQuery.data.value.total,
        totalPages: serverQuery.data.value.totalPages,
      }
    : null
})

const loading = computed(() => serverQuery.isLoading.value || serverQuery.isFetching.value)

function normalizeSortValue(value: WorkspaceRow[keyof WorkspaceRow]): number | string {
  return typeof value === 'number' ? value : value.toLowerCase()
}
</script>

<template>
  <UiCard>
    <template #header>
      <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 class="text-surface-900 text-lg font-bold dark:text-white">Server-side query demo</h3>
          <p class="text-muted-foreground mt-1 text-sm">
            The grid owns TanStack state, while TanStack Query reacts to <code>queryState</code> and
            returns the current page.
          </p>
        </div>
        <div class="text-muted-foreground text-sm">
          Query key updates with search, filters, sorting, and pagination.
        </div>
      </div>
    </template>

    <UiDataGrid
      :table="table"
      :loading="loading"
      :total-rows="serverMeta?.total"
      search-placeholder="Search workspaces"
      :page-size-options="[4, 8, 12]"
      empty-text="No workspaces match the current server query."
    />
  </UiCard>
</template>
