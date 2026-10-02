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
import { ref, type Ref } from 'vue'
import { z } from 'zod'

import { installSeams } from '@/bootstrap/seams'
import { installApiAuth } from '@/lib/api/client'
import {
  createCollectionApi,
  toQueryParams,
  type CollectionFilters,
} from '@/lib/api/collection-queries'
import { AppError } from '@/lib/errors'
import { defineQueryKeys } from '@/lib/query-keys'
import { __resetRuntimeSlots } from '@/lib/runtime'

import { withQueryClient } from '../../utils/query-client'
import { resetRuntimeState } from '../../utils/reset-runtime-state'

/**
 * The default collection dialect, pinned on the wire.
 *
 * `createCollectionApi({ resource, schema, keys })` with nothing else said, in
 * a project whose `api.overrides.ts` is as shipped, must go on sending exactly
 * the requests it always has and reading exactly the answers it always has.
 * Every existing module is that call. This file is the record of what "always
 * has" means: each request is asserted in full (method, path, query string in
 * order, body, the headers the collection layer is responsible for), and so is
 * what the composables hand back.
 *
 * It was written against the factory as it stood before collection dialects
 * existed, and must pass unchanged after them. An assertion here that has to
 * change is a behaviour change for every project that never opened the seam:
 * say so in the release notes, do not just update the expectation.
 */

interface Widget {
  id: string
  name: string
  stock: number
}

interface WidgetFilters extends CollectionFilters {
  status?: string
  flag?: boolean
  count?: number
  cleared?: string
  everything?: string
  missing?: null
  tags?: string[]
  range?: { from: string; to: string }
}

const widgetSchema = z.object({
  id: z.string(),
  name: z.string(),
  stock: z.number().int(),
})

const widgetKeys = defineQueryKeys('widgets')

const widgets = createCollectionApi<Widget, WidgetFilters, Omit<Widget, 'id'>, Partial<Widget>>({
  resource: 'widgets',
  schema: widgetSchema,
  keys: widgetKeys,
})

const bolt: Widget = { id: 'W-1', name: 'Bolt', stock: 40 }
const nut: Widget = { id: 'W-2', name: 'Nut', stock: 12 }

interface WireEntry {
  request: string
  body: string | null
  accept: string | null
  contentType: string | null
  authorization: string | null
}

const server = setupServer()
const wire: WireEntry[] = []

/** Note every request that reaches the network, then let the next handler answer. */
function recordWire() {
  server.use(
    http.all('*/api/*', async ({ request }) => {
      const url = new URL(request.url)
      const text = await request.clone().text()
      wire.push({
        request: `${request.method} ${url.pathname}${url.search}`,
        body: text === '' ? null : text,
        accept: request.headers.get('accept'),
        contentType: request.headers.get('content-type'),
        authorization: request.headers.get('authorization'),
      })
      // Returning nothing falls through to the next matching handler.
    }),
  )
}

/** What a read sends: no body, JSON asked for, the session's token. */
function read(request: string): WireEntry {
  return {
    request,
    body: null,
    accept: 'application/json',
    contentType: null,
    authorization: 'Bearer session-token',
  }
}

/** What a write with a JSON body sends. */
function write(request: string, body: unknown): WireEntry {
  return {
    request,
    body: JSON.stringify(body),
    accept: 'application/json',
    contentType: 'application/json',
    authorization: 'Bearer session-token',
  }
}

function page(data: Widget[], meta: Record<string, unknown>) {
  return HttpResponse.json({ data, meta })
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

describe('the list request of the default dialect', () => {
  it('sends the filters verbatim, in the order they were given, and drops what is cleared', async () => {
    server.use(
      http.get('*/api/widgets', () =>
        page([bolt, nut], { total: 12, page: 2, pageSize: 5, totalPages: 3 }),
      ),
    )
    recordWire()
    const filters = ref<WidgetFilters>({
      page: 2,
      pageSize: 5,
      search: 'steel bolt',
      sortBy: 'name',
      sortOrder: 'desc',
      status: 'active',
      flag: false,
      count: 0,
      // A cleared select, the "all" option, and an unset filter are not sent.
      cleared: '',
      everything: 'all',
      missing: null,
      // Arrays and objects have never been sent by this dialect.
      tags: ['a', 'b'],
      range: { from: '2026-01-01', to: '2026-02-01' },
    })
    const list = withQueryClient(() => widgets.useList(filters))

    await vi.waitFor(() => expect(list.isPending.value).toBe(false), { timeout: 5_000 })

    expect(wire).toEqual([
      read(
        'GET /api/widgets?page=2&pageSize=5&search=steel+bolt&sortBy=name&sortOrder=desc&status=active&flag=false&count=0',
      ),
    ])
    expect(list.items.value).toEqual([bolt, nut])
    expect(list.meta.value).toEqual({ total: 12, page: 2, pageSize: 5, totalPages: 3 })
    expect(list.isError.value).toBe(false)
    expect(list.error.value).toBeNull()
  })

  it('sends no query string for empty filters', async () => {
    server.use(
      http.get('*/api/widgets', () => page([], { total: 0, page: 1, pageSize: 10, totalPages: 1 })),
    )
    recordWire()
    const list = withQueryClient(() => widgets.useList(ref({})))

    await vi.waitFor(() => expect(list.isPending.value).toBe(false), { timeout: 5_000 })

    expect(wire).toEqual([read('GET /api/widgets')])
    expect(list.items.value).toEqual([])
    expect(list.meta.value).toEqual({ total: 0, page: 1, pageSize: 10, totalPages: 1 })
  })

  it('caches under the query parameters, so two spellings of "no filter" share an entry', async () => {
    server.use(
      http.get('*/api/widgets', () =>
        page([bolt], { total: 1, page: 1, pageSize: 10, totalPages: 1 }),
      ),
    )
    const { list, queryClient } = withQueryClient((client) => ({
      list: widgets.useList(ref<WidgetFilters>({ page: 1, status: '', tags: ['a'] })),
      queryClient: client,
    }))

    await vi.waitFor(() => expect(list.isPending.value).toBe(false), { timeout: 5_000 })

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey)
    expect(keys).toEqual([['widgets', 'list', { page: '1' }]])
  })

  it('keeps the previous page on screen while the next one loads', async () => {
    const release: { next?: () => void } = {}
    server.use(
      http.get('*/api/widgets', async ({ request }) => {
        const pageNumber = Number(new URL(request.url).searchParams.get('page'))
        if (pageNumber === 2) await new Promise<void>((resolve) => (release.next = resolve))
        return page(pageNumber === 2 ? [nut] : [bolt], {
          total: 2,
          page: pageNumber,
          pageSize: 1,
          totalPages: 2,
        })
      }),
    )
    recordWire()
    const filters: Ref<WidgetFilters> = ref({ page: 1, pageSize: 1 })
    const list = withQueryClient(() => widgets.useList(filters))
    await vi.waitFor(() => expect(list.items.value).toEqual([bolt]), { timeout: 5_000 })

    filters.value = { page: 2, pageSize: 1 }
    await vi.waitFor(() => expect(release.next).toBeTypeOf('function'), { timeout: 5_000 })

    // Page 2 is in flight: page 1 stays, and the list says it is fetching.
    expect(list.items.value).toEqual([bolt])
    expect(list.meta.value).toEqual({ total: 2, page: 1, pageSize: 1, totalPages: 2 })
    expect(list.isFetching.value).toBe(true)
    expect(list.isPending.value).toBe(false)

    release.next?.()
    await vi.waitFor(() => expect(list.items.value).toEqual([nut]), { timeout: 5_000 })

    expect(list.meta.value).toEqual({ total: 2, page: 2, pageSize: 1, totalPages: 2 })
    expect(wire).toEqual([
      read('GET /api/widgets?page=1&pageSize=1'),
      read('GET /api/widgets?page=2&pageSize=1'),
    ])
  })
})

describe('the list response of the default dialect', () => {
  async function failedList(body: unknown): Promise<AppError> {
    server.use(http.get('*/api/widgets', () => HttpResponse.json(body as never)))
    const list = withQueryClient(() => widgets.useList(ref({})))
    await vi.waitFor(() => expect(list.error.value).toBeTruthy(), { timeout: 5_000 })
    expect(list.error.value).toBeInstanceOf(AppError)
    expect(list.items.value).toEqual([])
    expect(list.meta.value).toBeNull()
    return list.error.value as AppError
  }

  it('drops what the envelope and its meta carry beyond the contract', async () => {
    server.use(
      http.get('*/api/widgets', () =>
        HttpResponse.json({
          data: [{ ...bolt, colour: 'grey' }],
          meta: { total: 1, page: 1, pageSize: 10, totalPages: 1, took: 3 },
          links: { next: null },
        }),
      ),
    )
    const list = withQueryClient(() => widgets.useList(ref({})))

    await vi.waitFor(() => expect(list.isPending.value).toBe(false), { timeout: 5_000 })

    expect(list.items.value).toEqual([bolt])
    expect(list.meta.value).toEqual({ total: 1, page: 1, pageSize: 10, totalPages: 1 })
  })

  it('accepts zero total pages, which some backends answer for an empty list', async () => {
    server.use(
      http.get('*/api/widgets', () => page([], { total: 0, page: 1, pageSize: 10, totalPages: 0 })),
    )
    const list = withQueryClient(() => widgets.useList(ref({})))

    await vi.waitFor(() => expect(list.isPending.value).toBe(false), { timeout: 5_000 })

    expect(list.meta.value).toEqual({ total: 0, page: 1, pageSize: 10, totalPages: 0 })
  })

  it('names a broken row by its place in the envelope', async () => {
    const error = await failedList({
      data: [bolt, { id: 'W-2', name: 7 }],
      meta: { total: 2, page: 1, pageSize: 10, totalPages: 1 },
    })

    expect(error).toMatchObject({ code: 'CONTRACT_MISMATCH', kind: 'contract', retryable: false })
    expect(error.details).toEqual({
      'data.1.name': ['Invalid input: expected string, received number'],
      'data.1.stock': ['Invalid input: expected number, received undefined'],
    })
    expect(error.message).toBe('The server sent a response this app could not read.')
    expect(error.messageKey).toBe('errors.contract')
  })

  it('refuses a zero-based page number', async () => {
    const error = await failedList({
      data: [],
      meta: { total: 0, page: 0, pageSize: 10, totalPages: 0 },
    })

    expect(error.code).toBe('CONTRACT_MISMATCH')
    expect(error.details).toEqual({ 'meta.page': ['Too small: expected number to be >0'] })
  })

  it.each([
    ['a bare array', [bolt], ['(root)']],
    ['null', null, ['(root)']],
    ['an envelope without meta', { data: [bolt] }, ['meta']],
    ['another envelope', { content: [bolt], totalElements: 1 }, ['data', 'meta']],
    [
      'a meta with other names',
      { data: [bolt], meta: { current_page: 1, per_page: 10, last_page: 1, total: 1 } },
      ['meta.page', 'meta.pageSize', 'meta.totalPages'],
    ],
  ])('reports %s as a contract mismatch', async (_, body, paths) => {
    const error = await failedList(body)

    expect(error.code).toBe('CONTRACT_MISMATCH')
    expect(error.messageKey).toBe('errors.contract')
    expect(Object.keys(error.details ?? {})).toEqual(paths)
  })
})

describe('the detail request of the default dialect', () => {
  it('asks for nothing until it has an id, then for /{resource}/{id}', async () => {
    server.use(http.get('*/api/widgets/:id', () => HttpResponse.json({ ...bolt, colour: 'grey' })))
    recordWire()
    const id = ref<string | undefined>(undefined)
    const detail = withQueryClient(() => widgets.useDetail(id))

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(wire).toEqual([])
    expect(detail.item.value).toBeUndefined()

    id.value = 'W-1'
    await vi.waitFor(() => expect(detail.item.value).toBeDefined(), { timeout: 5_000 })

    expect(wire).toEqual([read('GET /api/widgets/W-1')])
    // The record as the schema reads it: unknown keys are not carried along.
    expect(detail.item.value).toEqual(bolt)
    expect(detail.isError.value).toBe(false)
  })

  it('puts the id in the path as it was given', async () => {
    server.use(http.get('*/api/widgets/:id', () => HttpResponse.json(bolt)))
    recordWire()
    const detail = withQueryClient(() => widgets.useDetail('W 1'))

    await vi.waitFor(() => expect(detail.item.value).toBeDefined(), { timeout: 5_000 })

    // Recorded, not endorsed: the id is interpolated, and only what `fetch`
    // itself escapes is escaped.
    expect(wire).toEqual([read('GET /api/widgets/W%201')])
  })

  it('caches under the id', async () => {
    server.use(http.get('*/api/widgets/:id', () => HttpResponse.json(bolt)))
    const { detail, queryClient } = withQueryClient((client) => ({
      detail: widgets.useDetail(ref('W-1')),
      queryClient: client,
    }))

    await vi.waitFor(() => expect(detail.item.value).toBeDefined(), { timeout: 5_000 })

    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([['widgets', 'detail', 'W-1']])
  })

  it('does not unwrap an enveloped record', async () => {
    server.use(http.get('*/api/widgets/:id', () => HttpResponse.json({ data: bolt })))
    const detail = withQueryClient(() => widgets.useDetail('W-1'))

    await vi.waitFor(() => expect(detail.error.value).toBeTruthy(), { timeout: 5_000 })

    expect(detail.error.value).toMatchObject({ code: 'CONTRACT_MISMATCH' })
    expect(Object.keys((detail.error.value as AppError).details ?? {})).toEqual([
      'id',
      'name',
      'stock',
    ])
  })
})

describe('the writes of the default dialect', () => {
  const draft = { name: 'Washer', stock: 7 }
  const washer: Widget = { id: 'W-3', ...draft }

  it('creates with POST /{resource} and the payload as given', async () => {
    server.use(http.post('*/api/widgets', () => HttpResponse.json(washer, { status: 201 })))
    recordWire()
    const { create, invalidateQueries } = withQueryClient((client) => ({
      create: widgets.useCreate(),
      invalidateQueries: vi.spyOn(client, 'invalidateQueries'),
    }))

    const saved = await create.mutateAsync(draft)

    expect(wire).toEqual([write('POST /api/widgets', draft)])
    expect(saved).toEqual(washer)
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['widgets'] })
  })

  it('sends keys as the app spells them', async () => {
    server.use(http.post('*/api/widgets', () => HttpResponse.json(washer, { status: 201 })))
    recordWire()
    const create = withQueryClient(() => widgets.useCreate())

    const payload = { name: 'Washer', stock: 7, unitPrice: { amountMinor: 120 }, snake_key: 1 }
    await create.mutateAsync(payload)

    expect(wire).toEqual([write('POST /api/widgets', payload)])
  })

  it('updates with PATCH /{resource}/{id} and the patch as given', async () => {
    server.use(
      http.patch('*/api/widgets/:id', () => HttpResponse.json({ ...bolt, stock: 41, extra: true })),
    )
    recordWire()
    const { update, invalidateQueries } = withQueryClient((client) => ({
      update: widgets.useUpdate(),
      invalidateQueries: vi.spyOn(client, 'invalidateQueries'),
    }))

    const saved = await update.mutateAsync({ id: 'W-1', patch: { stock: 41 } })

    expect(wire).toEqual([write('PATCH /api/widgets/W-1', { stock: 41 })])
    expect(saved).toEqual({ ...bolt, stock: 41 })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['widgets'] })
  })

  it('reads the record back after an update answered without one', async () => {
    server.use(
      http.patch('*/api/widgets/:id', () => new HttpResponse(null, { status: 204 })),
      http.get('*/api/widgets/:id', () => HttpResponse.json({ ...bolt, stock: 41 })),
    )
    recordWire()
    const update = withQueryClient(() => widgets.useUpdate())

    const saved = await update.mutateAsync({ id: 'W-1', patch: { stock: 41 } })

    expect(wire).toEqual([
      write('PATCH /api/widgets/W-1', { stock: 41 }),
      read('GET /api/widgets/W-1'),
    ])
    expect(saved).toEqual({ ...bolt, stock: 41 })
  })

  it('reads a created record back by the id a 201 returned', async () => {
    server.use(
      http.post('*/api/widgets', () => HttpResponse.json({ id: 'W-3' }, { status: 201 })),
      http.get('*/api/widgets/:id', () => HttpResponse.json(washer)),
    )
    recordWire()
    const create = withQueryClient(() => widgets.useCreate())

    const saved = await create.mutateAsync(draft)

    expect(wire).toEqual([write('POST /api/widgets', draft), read('GET /api/widgets/W-3')])
    expect(saved).toEqual(washer)
  })

  it('reads a created record back from the Location of an empty 201', async () => {
    server.use(
      http.post(
        '*/api/widgets',
        () => new HttpResponse(null, { status: 201, headers: { Location: '/api/widgets/W-3' } }),
      ),
      http.get('*/api/widgets/:id', () => HttpResponse.json(washer)),
    )
    recordWire()
    const create = withQueryClient(() => widgets.useCreate())

    const saved = await create.mutateAsync(draft)

    expect(wire).toEqual([write('POST /api/widgets', draft), read('GET /api/widgets/W-3')])
    expect(saved).toEqual(washer)
  })

  it('does not unwrap an enveloped write result', async () => {
    server.use(
      http.post('*/api/widgets', () => HttpResponse.json({ data: washer }, { status: 201 })),
    )
    recordWire()
    const create = withQueryClient(() => widgets.useCreate())

    await expect(create.mutateAsync(draft)).rejects.toMatchObject({ code: 'CONTRACT_MISMATCH' })
    expect(wire).toEqual([write('POST /api/widgets', draft)])
  })

  it('removes with DELETE /{resource}/{id}, no body, and resolves with nothing', async () => {
    server.use(http.delete('*/api/widgets/:id', () => new HttpResponse(null, { status: 204 })))
    recordWire()
    const { remove, invalidateQueries } = withQueryClient((client) => ({
      remove: widgets.useRemove(),
      invalidateQueries: vi.spyOn(client, 'invalidateQueries'),
    }))

    await expect(remove.mutateAsync('W-1')).resolves.toBeUndefined()

    expect(wire).toEqual([read('DELETE /api/widgets/W-1')])
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['widgets'] })
  })

  it('invalidates after a write that failed, too', async () => {
    server.use(
      http.patch('*/api/widgets/:id', () =>
        HttpResponse.json({ message: 'Stock cannot be negative' }, { status: 422 }),
      ),
    )
    const { update, invalidateQueries } = withQueryClient((client) => ({
      update: widgets.useUpdate(),
      invalidateQueries: vi.spyOn(client, 'invalidateQueries'),
    }))

    await expect(update.mutateAsync({ id: 'W-1', patch: { stock: -1 } })).rejects.toMatchObject({
      status: 422,
      kind: 'http',
    })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['widgets'] })
  })
})

describe('with the shipped api.overrides.ts installed', () => {
  // The tests above run with no integration in the runtime slot at all, which
  // is how `core/lib` tests run. An app boots through `installSeams()`, which
  // installs what the project's overrides file resolves to: as shipped, the
  // same wire.
  beforeEach(() => installSeams())
  afterEach(async () => {
    __resetRuntimeSlots()
    await resetRuntimeState()
  })

  it('lists, reads, creates, updates and removes exactly as above', async () => {
    const washer: Widget = { id: 'W-3', name: 'Washer', stock: 7 }
    server.use(
      http.get('*/api/widgets', () =>
        page([bolt], { total: 1, page: 1, pageSize: 10, totalPages: 1 }),
      ),
      http.get('*/api/widgets/:id', () => HttpResponse.json(bolt)),
      http.post('*/api/widgets', () => HttpResponse.json(washer, { status: 201 })),
      http.patch('*/api/widgets/:id', () => HttpResponse.json({ ...bolt, stock: 41 })),
      http.delete('*/api/widgets/:id', () => new HttpResponse(null, { status: 204 })),
    )
    recordWire()
    const api = withQueryClient(() => ({
      list: widgets.useList(
        ref<WidgetFilters>({
          page: 1,
          pageSize: 10,
          sortBy: 'name',
          sortOrder: 'asc',
          tags: ['a'],
        }),
      ),
      detail: widgets.useDetail('W-1'),
      create: widgets.useCreate(),
      update: widgets.useUpdate(),
      remove: widgets.useRemove(),
    }))

    await vi.waitFor(
      () => {
        expect(api.list.isPending.value).toBe(false)
        expect(api.detail.isPending.value).toBe(false)
      },
      { timeout: 5_000 },
    )
    const created = await api.create.mutateAsync({ name: 'Washer', stock: 7 })
    const updated = await api.update.mutateAsync({ id: 'W-1', patch: { stock: 41 } })
    await api.remove.mutateAsync('W-1')

    // The writes invalidate the two queries, which refetch in the background:
    // only the first request of each kind is the subject here.
    const firstOfEach = [...new Map(wire.map((entry) => [entry.request, entry])).values()]
    expect(firstOfEach).toEqual([
      read('GET /api/widgets?page=1&pageSize=10&sortBy=name&sortOrder=asc'),
      read('GET /api/widgets/W-1'),
      write('POST /api/widgets', { name: 'Washer', stock: 7 }),
      write('PATCH /api/widgets/W-1', { stock: 41 }),
      read('DELETE /api/widgets/W-1'),
    ])
    expect(created).toEqual(washer)
    expect(updated).toEqual({ ...bolt, stock: 41 })
  })
})

describe('toQueryParams', () => {
  it.each([
    [{}, {}],
    [
      { page: 1, pageSize: 25, search: 'a b' },
      { page: '1', pageSize: '25', search: 'a b' },
    ],
    [
      { sortBy: 'name', sortOrder: 'asc' },
      { sortBy: 'name', sortOrder: 'asc' },
    ],
    [{ status: '', role: 'all', owner: null, team: undefined }, {}],
    [
      { active: true, archived: false, count: 0 },
      { active: 'true', archived: 'false', count: '0' },
    ],
    [{ tags: ['a', 'b'], range: { from: 1, to: 2 }, when: new Date(0) }, {}],
    // Only the exact strings are "cleared": these are values like any other.
    [
      { status: 'All', name: ' ', zero: '0' },
      { status: 'All', name: ' ', zero: '0' },
    ],
  ])('turns %j into %j', (filters, expected) => {
    expect(toQueryParams(filters)).toEqual(expected)
  })
})
