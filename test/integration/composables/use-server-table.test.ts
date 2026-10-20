import { param } from '@queryweave/core'
import type { MemoryQueryAdapterOptions } from '@queryweave/testing'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { computed, nextTick, ref, watch } from 'vue'

import { createColumns } from '@/composables/useDataTable'
import { useServerTable } from '@/composables/useServerTable'
import type { CollectionFilters, PageMeta } from '~/lib/api/collection-queries'
import { defineListQueryModel } from '~/lib/table-query'

import { createListStateFixture } from '../../utils/list-query-state'

interface Item {
  id: string
  name: string
  status: string
}
interface ItemFilters extends CollectionFilters {
  status?: string
}

const model = defineListQueryModel({
  sortBy: ['name'],
  fields: { status: param.choice(['all', 'active', 'archived']).default('all') },
})
const fixtures: Array<{ dispose: () => void }> = []
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.dispose()
  vi.useRealTimers()
})

function setup(initial = '', guard?: MemoryQueryAdapterOptions['guard']) {
  const fixture = createListStateFixture(model, { initial, guard })
  fixtures.push(fixture)
  const items = ref<Item[]>([
    { id: 'a', name: 'Alpha', status: 'active' },
    { id: 'b', name: 'Beta', status: 'active' },
  ])
  const meta = ref<PageMeta | null>({ total: 45, page: 1, pageSize: 10, totalPages: 5 })
  const pending = ref(false)
  const fetching = ref(false)
  const failed = ref(false)
  const header = ref('Name')
  const col = createColumns<Item>()
  const columns = computed(() => [
    col.text('name', { label: header.value }),
    col.text('status', { label: 'Status', filter: 'select' }),
  ])
  const requests: unknown[] = []
  const result = fixture.run(() =>
    useServerTable<Item, ItemFilters>({
      columns,
      rowKey: 'id',
      queryState: fixture.queryState,
      query: (filters) => {
        watch(filters, (value) => requests.push({ ...value }), { immediate: true })
        return {
          items,
          meta,
          isPending: pending,
          isFetching: fetching,
          isError: failed,
          refetch: vi.fn(),
        }
      },
    }),
  )
  return { ...fixture, ...result, items, meta, pending, fetching, failed, header, requests }
}

describe('native server table with QueryWeave', () => {
  it('reads a deep link once and leaves transport parameters in the collection contract', () => {
    const fixture = setup(
      '?page=2&pageSize=25&sortBy=name&sortOrder=desc&search=atlas&status=active&utm_source=demo',
    )
    expect(fixture.filters.value).toEqual({
      page: 2,
      pageSize: 25,
      sortBy: 'name',
      sortOrder: 'desc',
      search: 'atlas',
      status: 'active',
    })
    expect(fixture.table.value.page).toBe(2)
    expect(fixture.table.value.rows.map((row) => row.key)).toEqual(['a', 'b'])
    expect(fixture.requests).toHaveLength(1)
  })

  it('commits sorting, filters and page-size changes with a single page reset', async () => {
    const fixture = setup('?page=3')
    fixture.table.value.sort('name', 'desc')
    await vi.waitFor(() =>
      expect(fixture.filters.value).toMatchObject({ sortBy: 'name', sortOrder: 'desc', page: 1 }),
    )
    fixture.table.value.goToPage(2)
    await vi.waitFor(() => expect(fixture.filters.value.page).toBe(2))
    fixture.table.value.setPageSize(25)
    await vi.waitFor(() => expect(fixture.filters.value).toMatchObject({ pageSize: 25, page: 1 }))
    await nextTick()
    const before = fixture.requests.length
    fixture.table.value.filter('status', 'active')
    await vi.waitFor(() => expect(fixture.filters.value.status).toBe('active'))
    expect(fixture.requests.length - before).toBe(1)
  })

  it('debounces typing for 300ms and replaces rather than pushing each search', async () => {
    vi.useFakeTimers()
    const fixture = setup('?page=3&utm_source=demo')
    fixture.table.value.search('at')
    fixture.table.value.search('atlas')
    await vi.advanceTimersByTimeAsync(299)
    expect(fixture.filters.value.search).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(fixture.filters.value).toMatchObject({ search: 'atlas', page: 1 })
    expect(fixture.adapter.current()).toContain('utm_source=demo')
    expect(fixture.adapter.canGoBack()).toBe(false)
    expect(fixture.requests).toHaveLength(2)
  })

  it('flushes a pending search and committed domain filter atomically', async () => {
    const fixture = setup('?page=3')
    fixture.table.value.search('atlas')
    await fixture.queryState.update({ status: 'active', page: 1 })
    await nextTick()
    expect(fixture.filters.value).toMatchObject({ search: 'atlas', status: 'active', page: 1 })
    expect(fixture.requests).toHaveLength(2)
  })

  it('keeps local selection from flushing a pending search', async () => {
    vi.useFakeTimers()
    const fixture = setup('?page=3')
    fixture.table.value.search('atlas')
    fixture.table.value.select(['a'])
    await vi.advanceTimersByTimeAsync(299)
    expect(fixture.filters.value.search).toBeUndefined()
    expect(fixture.requests).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fixture.filters.value.search).toBe('atlas')
  })

  it('restores controls after a refused transition without requesting uncommitted data', async () => {
    const fixture = setup('', () => ({ outcome: 'refused' }))
    fixture.table.value.goToPage(2)
    await vi.waitFor(() => expect(fixture.table.value.page).toBe(1))
    expect(fixture.filters.value.page).toBe(1)
    expect(fixture.requests).toHaveLength(1)
  })

  it('preserves stable selection when server rows are replaced', async () => {
    const fixture = setup()
    fixture.table.value.select(['a'])
    fixture.items.value = [{ id: 'z', name: 'Zulu', status: 'active' }]
    await nextTick()
    expect(fixture.table.value.state.selection).toEqual(['a'])
    fixture.table.value.toggleAll('page')
    expect(fixture.table.value.state.selection).toEqual(['a', 'z'])
    expect(fixture.requests).toHaveLength(1)
  })

  it('keeps live columns, rows and totals on the same query source', async () => {
    const fixture = setup()
    fixture.header.value = 'Nom'
    fixture.items.value = [{ id: 'z', name: 'Zulu', status: 'active' }]
    fixture.meta.value = { total: 80, page: 1, pageSize: 10, totalPages: 8 }
    await nextTick()
    expect(fixture.table.value.columns[0]?.header).toBe('Nom')
    expect(fixture.table.value.rows[0]?.original.name).toBe('Zulu')
    expect(fixture.table.value.rowCount).toBe(80)
    expect(fixture.table.value.pageCount).toBe(8)
  })

  it('restores a deep-link page after initially unknown server totals arrive', async () => {
    const fixture = setup('?page=4')
    fixture.pending.value = true
    fixture.meta.value = null
    await nextTick()
    fixture.meta.value = { total: 80, page: 4, pageSize: 10, totalPages: 8 }
    fixture.pending.value = false
    await nextTick()
    expect(fixture.table.value.page).toBe(4)
    expect(fixture.filters.value.page).toBe(4)
  })

  it('replaces an out-of-range page only after current totals are settled', async () => {
    const fixture = setup('?page=8')
    await vi.waitFor(() => expect(fixture.filters.value.page).toBe(5))
    expect(fixture.table.value.page).toBe(5)
    expect(fixture.adapter.canGoBack()).toBe(false)
  })

  it('exposes pending, refresh and error states without losing the retry action', () => {
    const fixture = setup()
    fixture.pending.value = true
    expect(fixture.isLoading.value).toBe(true)
    fixture.pending.value = false
    fixture.fetching.value = true
    expect(fixture.isLoading.value).toBe(true)
    fixture.fetching.value = false
    fixture.failed.value = true
    expect(fixture.isLoading.value).toBe(false)
    expect(fixture.isError.value).toBe(true)
    fixture.refetch()
    expect(fixture.refetch).toHaveBeenCalledOnce()
  })
})

describe('typed list URL state', () => {
  it('recovers invalid URL fields and keeps their structured issues', () => {
    const fixture = setup('?page=-2&pageSize=999&sortBy=password&status=unknown')
    expect(fixture.filters.value).toMatchObject({ page: 1, pageSize: 10, status: 'all' })
    expect(fixture.filters.value.sortBy).toBeUndefined()
    expect(fixture.queryState.issues.value.length).toBeGreaterThanOrEqual(4)
  })

  it('uses browser-like Back and Forward to restore filters and pages', async () => {
    const fixture = setup()
    await fixture.queryState.update({ status: 'active', page: 1 })
    await fixture.queryState.update({ page: 2 })
    fixture.adapter.back()
    await nextTick()
    expect(fixture.filters.value).toMatchObject({ page: 1, status: 'active' })
    fixture.adapter.back()
    await nextTick()
    expect(fixture.filters.value.status).toBe('all')
    fixture.adapter.forward()
    await nextTick()
    expect(fixture.filters.value.status).toBe('active')
  })

  it('omits default fields from generated URLs and preserves unrelated keys', async () => {
    const fixture = setup('?utm_source=campaign&page=2')
    await fixture.queryState.update({ page: 1, status: 'all', search: '' })
    expect(fixture.adapter.current()).toBe('utm_source=campaign')
  })

  it('cleans up pending search writes when the route is disposed', async () => {
    vi.useFakeTimers()
    const fixture = setup()
    fixture.queryState.setSearch('atlas')
    fixture.dispose()
    await vi.advanceTimersByTimeAsync(300)
    expect(fixture.requests).toHaveLength(1)
  })

  it('does not share state between independent lists', async () => {
    const first = setup()
    const second = setup()
    await first.queryState.update({ search: 'atlas', page: 2 })
    expect(second.filters.value.search).toBeUndefined()
    expect(second.filters.value.page).toBe(1)
  })

  it('supports the users page size choices without broadening commerce models', () => {
    expect(() =>
      defineListQueryModel({ sortBy: ['name'], pageSize: 5, pageSizes: [5, 10, 20, 50] }),
    ).not.toThrow()
    const fixture = setup('?pageSize=20')
    expect(fixture.filters.value.pageSize).toBe(10)
  })
})
