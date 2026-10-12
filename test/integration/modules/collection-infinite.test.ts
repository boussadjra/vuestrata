import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test'
import { ref } from 'vue'
import { z } from 'zod'

import { installApiAuth } from '@/lib/api/client'
import { createCollectionApi, type CollectionFilters } from '@/lib/api/collection-queries'
import { dialects } from '@/lib/api/dialects'
import { AppError } from '@/lib/errors'
import { defineQueryKeys } from '@/lib/query-keys'

import { withQueryClient } from '../../utils/query-client'

/**
 * `useInfiniteList`: a list read a page at a time and kept as one. By cursor
 * where the dialect pages by cursor, by page number on every other.
 */

interface Event {
  id: string
  title: string
}

interface EventFilters extends CollectionFilters {
  kind?: string
}

const eventSchema = z.object({ id: z.string(), title: z.string() })
const events = (count: number, from = 1): Event[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `E-${from + index}`,
    title: `Event ${from + index}`,
  }))

const server = setupServer()
const wire: string[] = []

function recordWire() {
  server.use(
    http.all('*/api/*', ({ request }) => {
      const url = new URL(request.url)
      wire.push(`${request.method} ${url.pathname}${decodeURIComponent(url.search)}`)
    }),
  )
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  wire.length = 0
  installApiAuth({
    getToken: () => 'session-token',
    getRefreshToken: () => null,
    setAuth: () => {},
    clearAuth: () => {},
  })
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

async function loaded(feed: { items: { value: unknown[] } }, count: number) {
  await vi.waitFor(() => expect(feed.items.value).toHaveLength(count), { timeout: 5_000 })
}

describe('a list paged by cursor', () => {
  const feed = createCollectionApi<Event, EventFilters>({
    resource: 'events',
    schema: eventSchema,
    keys: defineQueryKeys('events'),
    dialect: dialects.drfCursor,
  })

  /** DRF's CursorPagination: three pages of two, linked by `next`. */
  function serveCursorPages() {
    server.use(
      http.get('*/api/events/', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        const page = cursor === null ? 0 : Number(cursor.replace('c', ''))
        return HttpResponse.json({
          next: page < 2 ? `http://api.example.org/events/?cursor=c${page + 1}&page_size=2` : null,
          previous: page > 0 ? `http://api.example.org/events/?cursor=c${page - 1}` : null,
          results: events(2, page * 2 + 1),
        })
      }),
    )
  }

  it('loads the first page, then the next with the cursor the backend gave', async () => {
    serveCursorPages()
    recordWire()
    const { list, queryClient } = withQueryClient((client) => ({
      // A page number means nothing to a cursor: it is not sent.
      list: feed.useInfiniteList(ref<EventFilters>({ page: 4, pageSize: 2, kind: 'release' })),
      queryClient: client,
    }))
    await loaded(list, 2)

    expect(list.hasMore.value).toBe(true)
    expect(list.isLoadingMore.value).toBe(false)
    expect(list.total.value).toBeUndefined()

    list.loadMore()
    expect(list.isLoadingMore.value).toBe(true)
    // A second click while the page loads asks for nothing more.
    list.loadMore()
    await loaded(list, 4)
    list.loadMore()
    await loaded(list, 6)

    expect(list.items.value.map((event) => event.id)).toEqual([
      'E-1',
      'E-2',
      'E-3',
      'E-4',
      'E-5',
      'E-6',
    ])
    expect(list.hasMore.value).toBe(false)
    expect(wire).toEqual([
      'GET /api/events/?page_size=2&kind=release',
      'GET /api/events/?page_size=2&kind=release&cursor=c1',
      'GET /api/events/?page_size=2&kind=release&cursor=c2',
    ])
    // One cache entry for the whole feed, beside the collection's other lists.
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([['events', 'list', { page_size: '2', kind: 'release' }, 'infinite']])
  })

  it('starts over when a filter changes', async () => {
    serveCursorPages()
    recordWire()
    const filters = ref<EventFilters>({ pageSize: 2 })
    const list = withQueryClient(() => feed.useInfiniteList(filters))
    await loaded(list, 2)
    list.loadMore()
    await loaded(list, 4)

    filters.value = { pageSize: 2, kind: 'incident' }
    await vi.waitFor(() => expect(wire).toHaveLength(3), { timeout: 5_000 })
    await loaded(list, 2)

    expect(wire.at(-1)).toBe('GET /api/events/?page_size=2&kind=incident')
  })

  it('reads Laravel cursorPaginate() the same way', async () => {
    const laravelFeed = createCollectionApi<Event>({
      resource: 'events',
      schema: eventSchema,
      keys: defineQueryKeys('events'),
      dialect: dialects.laravelCursor,
    })
    server.use(
      http.get('*/api/events', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        return HttpResponse.json({
          data: events(2, cursor ? 3 : 1),
          path: 'http://laravel.app/events',
          per_page: 2,
          next_cursor: cursor ? null : 'eyJpZCI6Mn0',
          next_page_url: cursor ? null : 'http://laravel.app/events?cursor=eyJpZCI6Mn0',
          prev_cursor: null,
          prev_page_url: null,
        })
      }),
    )
    recordWire()
    const list = withQueryClient(() => laravelFeed.useInfiniteList(ref({ pageSize: 2 })))
    await loaded(list, 2)
    list.loadMore()
    await loaded(list, 4)

    expect(list.hasMore.value).toBe(false)
    expect(wire).toEqual([
      'GET /api/events?per_page=2',
      'GET /api/events?per_page=2&cursor=eyJpZCI6Mn0',
    ])
  })

  it('validates each page: a broken row fails the list as a contract mismatch', async () => {
    server.use(
      http.get('*/api/events/', () =>
        HttpResponse.json({ next: null, previous: null, results: [{ id: 'E-1' }] }),
      ),
    )
    const list = withQueryClient(() => feed.useInfiniteList(ref({})))

    await vi.waitFor(() => expect(list.error.value).toBeTruthy(), { timeout: 5_000 })

    expect(list.error.value).toBeInstanceOf(AppError)
    expect(list.error.value).toMatchObject({ code: 'CONTRACT_MISMATCH' })
    expect(Object.keys((list.error.value as AppError).details ?? {})).toEqual(['data.0.title'])
    expect(list.items.value).toEqual([])
    expect(list.isError.value).toBe(true)
  })
})

describe('a list paged by number, read as a feed', () => {
  const orders = createCollectionApi<Event, EventFilters>({
    resource: 'orders',
    schema: eventSchema,
    keys: defineQueryKeys('orders'),
  })

  it('asks the default dialect for page 1, 2, 3 and stops at the last', async () => {
    server.use(
      http.get('*/api/orders', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        return HttpResponse.json({
          data: events(page === 3 ? 1 : 2, (page - 1) * 2 + 1),
          meta: { total: 5, page, pageSize: 2, totalPages: 3 },
        })
      }),
    )
    recordWire()
    const list = withQueryClient(() =>
      orders.useInfiniteList(ref<EventFilters>({ pageSize: 2, sortBy: 'title', page: 7 })),
    )
    await loaded(list, 2)

    expect(list.total.value).toBe(5)
    expect(list.hasMore.value).toBe(true)

    list.loadMore()
    await loaded(list, 4)
    list.loadMore()
    await loaded(list, 5)

    expect(list.hasMore.value).toBe(false)
    expect(wire).toEqual([
      'GET /api/orders?pageSize=2&sortBy=title&page=1',
      'GET /api/orders?pageSize=2&sortBy=title&page=2',
      'GET /api/orders?pageSize=2&sortBy=title&page=3',
    ])
  })

  it('stops at an empty page whatever the counts claim', async () => {
    server.use(
      http.get('*/api/orders', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        return HttpResponse.json({
          data: page === 1 ? events(2) : [],
          // The total moved while the user was reading.
          meta: { total: 40, page, pageSize: 2, totalPages: 20 },
        })
      }),
    )
    const list = withQueryClient(() => orders.useInfiniteList(ref({ pageSize: 2 })))
    await loaded(list, 2)
    list.loadMore()

    await vi.waitFor(() => expect(list.hasMore.value).toBe(false), { timeout: 5_000 })
    expect(list.items.value).toHaveLength(2)
  })

  it('counts from zero for a Spring backend', async () => {
    const parts = createCollectionApi<Event>({
      resource: 'parts',
      schema: eventSchema,
      keys: defineQueryKeys('parts'),
      dialect: dialects.spring,
    })
    server.use(
      http.get('*/api/parts', ({ request }) => {
        const number = Number(new URL(request.url).searchParams.get('page'))
        return HttpResponse.json({
          content: events(2, number * 2 + 1),
          totalElements: 4,
          totalPages: 2,
          size: 2,
          number,
        })
      }),
    )
    recordWire()
    const list = withQueryClient(() => parts.useInfiniteList(ref({ pageSize: 2 })))
    await loaded(list, 2)
    list.loadMore()
    await loaded(list, 4)

    expect(list.hasMore.value).toBe(false)
    expect(wire).toEqual(['GET /api/parts?size=2&page=0', 'GET /api/parts?size=2&page=1'])
  })

  it('is invalidated with the rest of the collection after a write', async () => {
    const served = { rows: 1 }
    server.use(
      http.get('*/api/orders', () =>
        HttpResponse.json({
          data: events(served.rows),
          meta: { total: served.rows, page: 1, pageSize: 10, totalPages: 1 },
        }),
      ),
      http.post('*/api/orders', () => {
        served.rows = 2
        return HttpResponse.json({ id: 'E-2', title: 'Event 2' }, { status: 201 })
      }),
    )
    const { list, create } = withQueryClient(() => ({
      list: orders.useInfiniteList(ref({})),
      create: orders.useCreate(),
    }))
    await loaded(list, 1)

    await create.mutateAsync({ title: 'Event 2' })

    await loaded(list, 2)
  })
})
