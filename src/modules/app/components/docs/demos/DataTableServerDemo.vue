<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { Ref } from 'vue'

import { createColumns } from '@/composables/useDataTable'
import { useServerTable, type ServerCollection } from '@/composables/useServerTable'
import type { CollectionFilters, PageMeta } from '~/lib/api/collection-queries'

interface WorkspaceRow {
  id: string
  workspace: string
  owner: string
  state: 'Active' | 'Review' | 'Blocked'
  seats: number
}

interface WorkspaceResult {
  rows: WorkspaceRow[]
  meta: PageMeta
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

const col = createColumns<WorkspaceRow>()
const columns = [
  col.text('workspace', { label: 'Workspace', width: '16rem' }),
  col.text('owner', { label: 'Owner', width: '10rem' }),
  col.text('state', { label: 'State', width: '9rem' }),
  col.text('seats', { label: 'Seats', align: 'end', width: '7rem' }),
]

function fetchWorkspacePage(filters: CollectionFilters): WorkspaceResult {
  let rows = [...sourceRows]
  const search = filters.search?.trim().toLowerCase()
  const pageSize = filters.pageSize || 4
  const page = filters.page || 1

  if (search) {
    rows = rows.filter(
      (row) =>
        row.workspace.toLowerCase().includes(search) || row.owner.toLowerCase().includes(search),
    )
  }

  if (filters.sortBy) {
    const sortKey = filters.sortBy as keyof WorkspaceRow
    const direction = filters.sortOrder === 'desc' ? -1 : 1
    rows = rows.toSorted((left, right) => {
      const leftValue = normalizeSortValue(left[sortKey])
      const rightValue = normalizeSortValue(right[sortKey])

      if (leftValue < rightValue) return -1 * direction
      if (leftValue > rightValue) return 1 * direction
      return 0
    })
  }

  const total = rows.length
  const start = (page - 1) * pageSize

  return {
    rows: rows.slice(start, start + pageSize),
    meta: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  }
}

function useWorkspaceQuery(filters: Ref<CollectionFilters>): ServerCollection<WorkspaceRow> {
  const query = useQuery({
    queryKey: computed(() => ['data-table-server-demo', { ...filters.value }]),
    queryFn: async () => fetchWorkspacePage(filters.value),
  })

  return {
    items: computed(() => query.data.value?.rows ?? []),
    meta: computed(() => query.data.value?.meta ?? null),
    isPending: computed(() => query.isPending.value),
    isFetching: computed(() => query.isFetching.value),
    isError: computed(() => query.isError.value),
    refetch: () => {
      void query.refetch()
    },
  }
}

const { table, isLoading, isError, refetch } = useServerTable<WorkspaceRow>({
  columns,
  query: useWorkspaceQuery,
  pageSize: 4,
})

function normalizeSortValue(value: WorkspaceRow[keyof WorkspaceRow]): number | string {
  return typeof value === 'number' ? value : value.toLowerCase()
}
</script>

<template>
  <UiDataGrid
    :table="table"
    :loading="isLoading"
    :error="isError"
    search-placeholder="Search workspaces"
    :page-size-options="[4, 8, 12]"
    aria-label="Workspaces"
    empty-text="No workspaces match the current server query."
    @retry="refetch"
  />
</template>
