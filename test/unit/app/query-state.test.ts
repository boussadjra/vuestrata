import { queryAdapterKey } from '@queryweave/vue'
import type { VueRouterQueryAdapter } from '@queryweave/vue-router'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { defineComponent, h, inject, nextTick, ref, watch } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useListRouteState, type ListRouteState } from '@/composables/useListRouteState'
import { useServerTable } from '@/composables/useServerTable'
import { installQueryState } from '@/plugins/query-state'
import type { CollectionFilters, PageMeta } from '~/lib/api/collection-queries'
import { defineListQueryModel } from '~/lib/table-query'

vi.mock('@/plugins/router', () => ({ router: undefined }))
enableAutoUnmount(afterEach)

async function setup(initial = '/items?utm_source=demo#rows') {
  const router = createRouter({
    history: createMemoryHistory('/console/'),
    routes: [{ path: '/items', component: { render: () => null } }],
  })
  await router.push(initial)
  await router.isReady()
  let state!: ListRouteState
  let adapter!: VueRouterQueryAdapter
  let server!: ReturnType<typeof useServerTable<{ id: string; name: string }>>
  const requests: CollectionFilters[] = []
  const wrapper = mount(
    defineComponent({
      setup() {
        adapter = inject(queryAdapterKey)! as VueRouterQueryAdapter
        state = useListRouteState(defineListQueryModel({ sortBy: ['name'] }))
        server = useServerTable({
          queryState: state,
          rowKey: 'id',
          columns: [{ id: 'name', header: 'Name' }],
          query: (filters) => {
            watch(filters, (value) => requests.push({ ...value }), { immediate: true })
            return {
              items: ref([{ id: 'one', name: 'One' }]),
              meta: ref<PageMeta | null>({ total: 20, page: 1, pageSize: 10, totalPages: 2 }),
              isPending: ref(false),
              isFetching: ref(false),
              isError: ref(false),
              refetch: vi.fn(),
            }
          },
        })
        return () => h('div')
      },
    }),
    { global: { plugins: [{ install: (app) => installQueryState(app, router) }] } },
  )
  return { router, state, adapter, wrapper, table: server.table, requests }
}

describe('application QueryWeave adapter', () => {
  it('keeps router-owned paths, hashes and unrelated query parameters', async () => {
    const { router, state } = await setup()
    expect(await state.update({ page: 2 })).toBe(true)
    expect(router.currentRoute.value).toMatchObject({
      path: '/items',
      hash: '#rows',
      query: { utm_source: 'demo', page: '2' },
    })
    expect(router.resolve(router.currentRoute.value).href).toMatch(/^\/console\/items\?.*#rows$/)
  })

  it('leaves committed state alone when the actual router refuses navigation', async () => {
    const { router, state } = await setup()
    router.beforeEach((to) => (to.query.page === '2' ? false : true))
    expect(await state.update({ page: 2 })).toBe(false)
    expect(state.values.value.page).toBe(1)
    expect(router.currentRoute.value.query.page).toBeUndefined()
  })

  it('disposes the application adapter when its app unmounts', async () => {
    const { adapter, wrapper } = await setup()
    const dispose = vi.spyOn(adapter, 'dispose')
    wrapper.unmount()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('keeps newer typing when an earlier search waits for a router guard', async () => {
    vi.useFakeTimers()
    try {
      const { router, state } = await setup()
      let release!: () => void
      const waiting = new Promise<void>((resolve) => {
        release = resolve
      })
      router.beforeEach(async (to) => {
        if (to.query.search === 'A') await waiting
      })
      state.setSearch('A')
      await vi.advanceTimersByTimeAsync(300)
      state.setSearch('AB')
      release()
      await vi.advanceTimersByTimeAsync(0)
      expect(state.search.value).toBe('AB')
      await vi.advanceTimersByTimeAsync(300)
      expect(state.values.value.search).toBe('AB')
      expect(router.currentRoute.value.query.search).toBe('AB')
    } finally {
      vi.useRealTimers()
    }
  })

  it('lets external navigation supersede pending typing during an older guard', async () => {
    vi.useFakeTimers()
    try {
      const { router, state, table } = await setup()
      let release!: () => void
      const waiting = new Promise<void>((resolve) => {
        release = resolve
      })
      router.beforeEach(async (to) => {
        if (to.query.search === 'A') await waiting
      })
      state.setSearch('A')
      await vi.advanceTimersByTimeAsync(300)
      state.setSearch('AB')
      await router.push('/items?page=3#rows')
      release()
      await vi.advanceTimersByTimeAsync(300)
      expect(router.currentRoute.value.query).toEqual({ page: '3' })
      expect(state.values.value.page).toBe(3)
      expect(state.search.value).toBe('')
      expect(table.value.state.search).toBe('')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the displayed table draft while an earlier committed search reaches the collection', async () => {
    vi.useFakeTimers()
    try {
      const { router, state, table, requests } = await setup()
      let release!: () => void
      const waiting = new Promise<void>((resolve) => {
        release = resolve
      })
      router.beforeEach(async (to) => {
        if (to.query.search === 'A') await waiting
      })

      table.value.search('A')
      await vi.advanceTimersByTimeAsync(300)
      table.value.search('AB')
      release()
      await vi.advanceTimersByTimeAsync(0)
      await nextTick()

      expect(state.values.value.search).toBe('A')
      expect(state.search.value).toBe('AB')
      expect(table.value.state.search).toBe('AB')
      expect(requests.map((request) => request.search ?? '')).toEqual(['', 'A'])

      await vi.advanceTimersByTimeAsync(300)
      await nextTick()
      expect(state.values.value.search).toBe('AB')
      expect(table.value.state.search).toBe('AB')
      expect(requests.map((request) => request.search ?? '')).toEqual(['', 'A', 'AB'])
    } finally {
      vi.useRealTimers()
    }
  })
})
