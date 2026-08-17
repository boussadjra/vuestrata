<script setup lang="ts">
import { createColumns, useDataTable } from '@/composables/useDataTable'

import { directoryApiFallback, type DirectoryApiUser } from './data-table-fixtures'

const USERS_URL = 'https://jsonplaceholder.typicode.com/users'

interface PlaceholderUser {
  id: number
  name: string
  email: string
  address?: { city?: string }
  company?: { name?: string }
}

const rows = ref<DirectoryApiUser[]>([])
const loading = ref(true)
const live = ref(false)
let request: AbortController | null = null

const col = createColumns<DirectoryApiUser>()
const columns = [
  col.text('name', { label: 'Name', width: '14rem' }),
  col.text('email', { label: 'Email' }),
  col.text('company', { label: 'Company', width: '14rem' }),
  col.text('city', { label: 'City', width: '12rem' }),
]

const { table } = useDataTable({
  data: () => rows.value,
  columns,
  pageSize: 5,
  getRowId: (row) => String(row.id),
})

function mapUsers(payload: PlaceholderUser[]): DirectoryApiUser[] {
  return payload.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    company: user.company?.name ?? '—',
    city: user.address?.city ?? '—',
  }))
}

async function load(): Promise<void> {
  request?.abort()
  const controller = new AbortController()
  request = controller
  loading.value = true

  try {
    const response = await fetch(USERS_URL, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = (await response.json()) as PlaceholderUser[]
    if (controller.signal.aborted) return
    rows.value = mapUsers(payload)
    live.value = true
  } catch {
    if (controller.signal.aborted) return
    rows.value = directoryApiFallback
    live.value = false
  } finally {
    if (!controller.signal.aborted) loading.value = false
  }
}

function retryLive(): void {
  void load()
}

onMounted(() => {
  void load()
})

onUnmounted(() => {
  request?.abort()
})
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-muted-foreground text-sm">
        <template v-if="loading">Loading directory from jsonplaceholder.typicode.com…</template>
        <template v-else-if="live">
          Live data from jsonplaceholder.typicode.com/users (10 people).
        </template>
        <template v-else>
          The public API was unreachable, so the grid is showing a local 10-row fallback.
        </template>
      </p>
      <UiButton v-if="!live && !loading" size="sm" variant="ghost" @click="retryLive">
        Retry live API
      </UiButton>
    </div>
    <UiDataGrid
      :table="table"
      :loading="loading"
      search-placeholder="Search people"
      aria-label="Public API directory"
      empty-text="No people returned."
    />
  </div>
</template>
