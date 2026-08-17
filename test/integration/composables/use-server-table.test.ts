import { describe, expect, it, vi } from 'vite-plus/test'
import { computed, nextTick, ref, type Ref } from 'vue'

import { createColumnHelper, useDataTable } from '@/composables/useDataTable'
import { useServerTable, type ServerCollection } from '@/composables/useServerTable'
import type { CollectionFilters, PageMeta } from '~/lib/api/collection-queries'

interface Item {
  id: string
  name: string
}

interface ItemFilters extends CollectionFilters {
  status?: string
}

const helper = createColumnHelper<Item>()

const items = ref<Item[]>([
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
])

const meta = ref<PageMeta | null>({ total: 2, page: 1, pageSize: 10, totalPages: 1 })

function createQuery(): (filters: Ref<ItemFilters>) => ServerCollection<Item> {
  return () => ({
    items,
    meta,
    isPending: ref(false),
    isFetching: ref(false),
    isError: ref(false),
    refetch: vi.fn(),
  })
}

describe('useServerTable', () => {
  it('maps table state into collection filters', async () => {
    const { table, filters, queryState } = useServerTable<Item, ItemFilters>({
      columns: [helper.accessor('name', { header: 'Name' })],
      query: createQuery(),
      extra: () => ({ status: 'active' }),
      searchDebounceMs: 0,
    })

    table.setSorting([{ id: 'name', desc: true }])
    table.setPageSize(25)
    await nextTick()

    expect(queryState.value.sorting[0]).toMatchObject({ id: 'name', direction: 'desc' })
    expect(filters.value).toMatchObject({
      page: 1,
      pageSize: 25,
      sortBy: 'name',
      sortOrder: 'desc',
      status: 'active',
    })

    meta.value = { total: 50, page: 1, pageSize: 25, totalPages: 2 }
    await nextTick()
    table.setPageIndex(1)
    await nextTick()
    expect(filters.value.page).toBe(2)
  })

  it('debounces search separately from paging', async () => {
    vi.useFakeTimers()

    const { table, filters } = useServerTable<Item, ItemFilters>({
      columns: [helper.accessor('name', { header: 'Name' })],
      query: createQuery(),
      searchDebounceMs: 50,
    })

    table.setGlobalFilter('atlas')
    await nextTick()
    expect(filters.value.search).toBeUndefined()

    await vi.advanceTimersByTimeAsync(50)
    await nextTick()

    expect(filters.value.search).toBe('atlas')

    vi.useRealTimers()
  })

  it('updates columns when the getter changes', async () => {
    const header = ref('Name')
    const columns = computed(() => [
      helper.accessor('name', { header: header.value, meta: { label: header.value } }),
    ])

    const { table } = useServerTable<Item, ItemFilters>({
      columns,
      query: createQuery(),
    })

    expect(table.getAllColumns()[0]?.columnDef.header).toBe('Name')
    expect(table.getAllColumns()[0]?.columnDef.meta?.label).toBe('Name')

    header.value = 'Nom'
    await nextTick()

    expect(table.getAllColumns()[0]?.columnDef.header).toBe('Nom')
    expect(table.getAllColumns()[0]?.columnDef.meta?.label).toBe('Nom')
  })

  it('uses row.id by default', () => {
    const { table } = useServerTable<Item, ItemFilters>({
      columns: [helper.accessor('name', { header: 'Name' })],
      query: createQuery(),
    })

    expect(table.getRowModel().rows.map((row) => row.id)).toEqual(['a', 'b'])
  })

  it('exposes isLoading as pending or fetching', () => {
    const isPending = ref(true)
    const isFetching = ref(false)

    const { isLoading } = useServerTable<Item, ItemFilters>({
      columns: [helper.accessor('name', { header: 'Name' })],
      query: () => ({
        items,
        meta,
        isPending,
        isFetching,
        isError: ref(false),
        refetch: vi.fn(),
      }),
    })

    expect(isLoading.value).toBe(true)
    isPending.value = false
    isFetching.value = true
    expect(isLoading.value).toBe(true)
    isFetching.value = false
    expect(isLoading.value).toBe(false)
  })
})

describe('useDataTable live columns', () => {
  it('rebuilds headers when columns are a computed getter', async () => {
    const header = ref('Name')
    const columns = computed(() => [helper.accessor('name', { header: header.value })])

    const { table } = useDataTable({
      data: items.value,
      columns,
    })

    expect(table.getAllColumns()[0]?.columnDef.header).toBe('Name')

    header.value = 'Nom'
    await nextTick()

    expect(table.getAllColumns()[0]?.columnDef.header).toBe('Nom')
  })
})
