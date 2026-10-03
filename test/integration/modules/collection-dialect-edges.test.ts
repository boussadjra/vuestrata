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
import { nextTick, ref } from 'vue'
import { z } from 'zod'

import { installApiAuth } from '@/lib/api/client'
import { createCollectionApi, type CollectionFilters } from '@/lib/api/collection-queries'
import { dialects, extendDialect } from '@/lib/api/dialects'
import { AppError } from '@/lib/errors'
import { defineQueryKeys } from '@/lib/query-keys'
import { __resetRuntimeSlots } from '@/lib/runtime'

import { captureLogged } from '../../utils/logged'
import { withQueryClient } from '../../utils/query-client'
import { resetRuntimeState } from '../../utils/reset-runtime-state'

/**
 * Where a dialect meets something it was not written for: a filter it cannot
 * send, a name the case rule gets wrong, a page that is no longer there. Each
 * used to fail silently or in the wrong place; each is pinned here by what
 * reaches the network and what the composable reports.
 */

const server = setupServer()
const wire: string[] = []
const logged = { warnings: (): string[] => [], restore: (): void => {} }

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
  Object.assign(logged, captureLogged())
  installApiAuth({
    getToken: () => 'session-token',
    getRefreshToken: () => null,
    setAuth: () => {},
    clearAuth: () => {},
  })
})
afterEach(async () => {
  logged.restore()
  server.resetHandlers()
  __resetRuntimeSlots()
  await resetRuntimeState()
})
afterAll(() => server.close())

interface Part {
  id: string
  name: string
}

interface PartFilters extends CollectionFilters {
  made?: { from: number }
  status?: string
}

const partSchema = z.object({ id: z.string(), name: z.string() })
const bolt: Part = { id: 'P-1', name: 'Bolt' }

function drfPage(results: Part[], count = results.length) {
  return HttpResponse.json({ count, next: null, previous: null, results })
}

// ─── A filter the dialect cannot write ──────────────────────────────────────

describe('a filter the dialect cannot write, in development', () => {
  const parts = createCollectionApi<Part, PartFilters>({
    resource: 'parts',
    schema: partSchema,
    keys: defineQueryKeys('parts'),
    dialect: dialects.drf,
  })

  it('is the list’s error state, with the message, and nothing is sent', async () => {
    recordWire()
    const list = withQueryClient(() => parts.useList(ref<PartFilters>({ made: { from: 1 } })))

    await vi.waitFor(() => expect(list.isError.value).toBe(true), { timeout: 5_000 })

    expect(list.error.value).toBeInstanceOf(AppError)
    expect(list.error.value).toMatchObject({ code: 'UNSERIALIZABLE_FILTER', retryable: false })
    expect(list.error.value?.message).toBe(
      'The "drf" collection dialect cannot send the filter "made": it is an object, and the ' +
        'dialect has no rule for objects. Give the dialect a serializer for it ' +
        '(`query.serialize` or `query.objects`), or leave it out of the filters.',
    )
    expect(list.items.value).toEqual([])
    expect(wire).toEqual([])
  })

  it('fails the list when a filter turns unwritable later, and recovers when it is fixed', async () => {
    server.use(http.get('*/api/parts/', () => drfPage([bolt])))
    recordWire()
    const filters = ref<PartFilters>({ page: 1 })
    const list = withQueryClient(() => parts.useList(filters))
    await vi.waitFor(() => expect(list.items.value).toEqual([bolt]), { timeout: 5_000 })

    // The reactive flush recomputes the cache key: it must not throw.
    filters.value = { page: 1, made: { from: 1 } }
    await nextTick()
    await vi.waitFor(() => expect(list.isError.value).toBe(true), { timeout: 5_000 })
    expect(list.error.value).toMatchObject({ code: 'UNSERIALIZABLE_FILTER' })

    // Fixed, with the very filters that worked before: not the failure, cached.
    filters.value = { page: 1 }
    await vi.waitFor(() => expect(list.isError.value).toBe(false), { timeout: 5_000 })
    expect(list.error.value).toBeNull()
    expect(list.items.value).toEqual([bolt])

    expect(wire.every((request) => request === 'GET /api/parts/?page=1')).toBe(true)
  })

  it('is the infinite list’s error state too', async () => {
    recordWire()
    const list = withQueryClient(() =>
      parts.useInfiniteList(ref<PartFilters>({ made: { from: 1 } })),
    )

    await vi.waitFor(() => expect(list.isError.value).toBe(true), { timeout: 5_000 })

    expect(list.error.value).toMatchObject({ code: 'UNSERIALIZABLE_FILTER' })
    expect(wire).toEqual([])
  })

  it('refuses a filter named like one of the dialect’s own parameters', async () => {
    recordWire()
    const list = withQueryClient(() =>
      parts.useList(ref({ page: 2, pageSize: 10, page_size: 99 } as PartFilters)),
    )

    await vi.waitFor(() => expect(list.isError.value).toBe(true), { timeout: 5_000 })

    expect(list.error.value?.message).toContain(
      'cannot send the filter "page_size": it would be sent as "page_size", which is this ' +
        "dialect's page size parameter",
    )
    expect(wire).toEqual([])
  })
})

describe('a filter the dialect cannot write, in a production build', () => {
  // What `unserializable` defaults to once `import.meta.env.DEV` is false.
  const parts = createCollectionApi<Part, PartFilters>({
    resource: 'parts',
    schema: partSchema,
    keys: defineQueryKeys('parts'),
    dialect: extendDialect(dialects.drf, { query: { unserializable: 'warn' } }),
  })

  it('sends the request without it, and says so once however the filter changes', async () => {
    server.use(http.get('*/api/parts/', () => drfPage([bolt])))
    recordWire()
    const filters = ref<PartFilters>({ page: 1, status: 'open', made: { from: 1 } })
    const list = withQueryClient(() => parts.useList(filters))
    await vi.waitFor(() => expect(list.isPending.value).toBe(false), { timeout: 5_000 })

    filters.value = { page: 1, status: 'open', made: { from: 2 } }
    await nextTick()
    filters.value = { page: 2, status: 'open', made: { from: 3 } }
    await vi.waitFor(() => expect(wire).toHaveLength(2), { timeout: 5_000 })
    await vi.waitFor(() => expect(list.isFetching.value).toBe(false), { timeout: 5_000 })

    expect(list.isError.value).toBe(false)
    expect(wire).toEqual([
      'GET /api/parts/?page=1&status=open',
      'GET /api/parts/?page=2&status=open',
    ])
    expect(
      logged.warnings().filter((line) => line.includes('cannot send the filter "made"')),
    ).toHaveLength(1)
  })

  it('lets the dialect’s own parameter win over a filter of the same name', async () => {
    server.use(http.get('*/api/parts/', () => drfPage([bolt])))
    recordWire()
    const list = withQueryClient(() =>
      parts.useList(ref({ page: 2, pageSize: 10, page_size: 99, ordering: 'x' } as PartFilters)),
    )
    await vi.waitFor(() => expect(list.isPending.value).toBe(false), { timeout: 5_000 })

    expect(wire).toEqual(['GET /api/parts/?page=2&page_size=10'])
    expect(logged.warnings()).toHaveLength(2)
  })
})

// ─── Names the case rule gets wrong ─────────────────────────────────────────

describe('key renaming that would lose a field', () => {
  interface Account {
    id: string
    userID?: string
    homeURL?: string
    addressLine1?: string
    displayName: string
  }

  const accountSchema = z.object({
    id: z.string(),
    userID: z.string().optional(),
    homeURL: z.string().optional(),
    addressLine1: z.string().optional(),
    displayName: z.string(),
  })

  const onTheWire = {
    id: 'A-1',
    user_id: 'U-7',
    home_url: 'https://acme.test',
    address_line_1: '1 Main St',
    display_name: 'Acme',
  }

  function serve() {
    server.use(
      http.get('*/api/accounts', () =>
        HttpResponse.json({
          data: [onTheWire],
          meta: { current_page: 1, per_page: 10, last_page: 1, total: 1 },
        }),
      ),
      http.get('*/api/accounts/:id', () => HttpResponse.json({ data: onTheWire })),
    )
  }

  it('warns, once per key and with the entry to add, and never with a value', async () => {
    const accounts = createCollectionApi<Account>({
      resource: 'accounts',
      schema: accountSchema,
      keys: defineQueryKeys('accounts'),
      dialect: extendDialect(dialects.laravel, { keys: 'camel' }),
    })
    serve()
    const api = withQueryClient(() => ({
      list: accounts.useList(ref({})),
      detail: accounts.useDetail('A-1'),
      again: accounts.useList(ref({ page: 2 })),
    }))
    await vi.waitFor(
      () => {
        expect(api.list.isPending.value).toBe(false)
        expect(api.detail.isPending.value).toBe(false)
        expect(api.again.isPending.value).toBe(false)
      },
      { timeout: 5_000 },
    )

    // What the reviewer found: the optional fields are simply not there.
    expect(api.detail.item.value).toEqual({
      id: 'A-1',
      addressLine1: '1 Main St',
      displayName: 'Acme',
    })

    const said = logged.warnings()
    expect(said).toEqual([
      expect.stringContaining(
        'The field "userID" of "accounts" does not survive the "laravel" dialect\'s key ' +
          'renaming: it is sent as "user_id", which is read back as "userId", so the field ' +
          'arrives missing. Add names: { "userID": "user_id" } to the dialect\'s keys.',
      ),
      expect.stringContaining('Add names: { "homeURL": "home_url" } to the dialect\'s keys.'),
      expect.stringContaining(
        'The key "address_line_1" in a response for "accounts" is read as "addressLine1", ' +
          'which the "laravel" dialect writes back as "address_line1": a write the backend ' +
          'will not recognise. Add names: { "addressLine1": "address_line_1" } to the ' +
          "dialect's keys.",
      ),
    ])
    expect(said.join('\n')).not.toMatch(/U-7|acme\.test|Main St/)
  })

  it('reads and writes every field, silently, once the names are given', async () => {
    const accounts = createCollectionApi<Account>({
      resource: 'accounts',
      schema: accountSchema,
      keys: defineQueryKeys('accounts'),
      dialect: extendDialect(dialects.laravel, {
        keys: {
          wire: 'snake',
          names: { userID: 'user_id', homeURL: 'home_url', addressLine1: 'address_line_1' },
        },
      }),
    })
    serve()
    const bodies: unknown[] = []
    server.use(
      http.patch('*/api/accounts/:id', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: onTheWire })
      }),
    )
    const api = withQueryClient(() => ({
      detail: accounts.useDetail('A-1'),
      update: accounts.useUpdate(),
    }))
    await vi.waitFor(() => expect(api.detail.isPending.value).toBe(false), { timeout: 5_000 })

    await api.update.mutateAsync({
      id: 'A-1',
      patch: { userID: 'U-8', homeURL: 'https://x.test', addressLine1: '2 Main St' },
    })

    expect(api.detail.item.value).toEqual({
      id: 'A-1',
      userID: 'U-7',
      homeURL: 'https://acme.test',
      addressLine1: '1 Main St',
      displayName: 'Acme',
    })
    expect(bodies).toEqual([
      { user_id: 'U-8', home_url: 'https://x.test', address_line_1: '2 Main St' },
    ])
    expect(logged.warnings()).toEqual([])
  })

  it('says when two keys of a response are read as one, once, without their values', async () => {
    const accounts = createCollectionApi<Account>({
      resource: 'accounts',
      schema: z.object({ id: z.string(), displayName: z.string() }),
      keys: defineQueryKeys('accounts'),
      dialect: extendDialect(dialects.laravel, { keys: 'camel' }),
    })
    const twice = { id: 'A-1', display_name: 'first-value', displayName: 'second-value' }
    server.use(
      http.get('*/api/accounts', () =>
        HttpResponse.json({
          data: [twice, { ...twice, id: 'A-2' }],
          meta: { current_page: 1, per_page: 10, last_page: 1, total: 2 },
        }),
      ),
    )
    const list = withQueryClient(() => accounts.useList(ref({})))
    await vi.waitFor(() => expect(list.isPending.value).toBe(false), { timeout: 5_000 })

    // The last one wins, as before.
    expect(list.items.value.map((account) => account.displayName)).toEqual([
      'second-value',
      'second-value',
    ])
    const said = logged.warnings().filter((line) => line.includes('are all read as'))
    expect(said).toHaveLength(1)
    expect(said[0]).toContain(
      'A response for "accounts" has 2 keys that are all read as "displayName" ' +
        '("display_name", "displayName")',
    )
    expect(said[0]).not.toMatch(/first-value|second-value/)
  })

  it('says nothing for a collection whose dialect keeps keys as they are', async () => {
    const accounts = createCollectionApi<{ id: string; userID?: string }>({
      resource: 'accounts',
      schema: z.object({ id: z.string(), userID: z.string().optional() }),
      keys: defineQueryKeys('accounts'),
      dialect: dialects.laravel,
    })
    server.use(
      http.get('*/api/accounts/:id', () =>
        HttpResponse.json({ data: { id: 'A-1', userID: 'U-7', user_id: 'x' } }),
      ),
    )
    const detail = withQueryClient(() => accounts.useDetail('A-1'))
    await vi.waitFor(() => expect(detail.isPending.value).toBe(false), { timeout: 5_000 })

    expect(detail.item.value).toEqual({ id: 'A-1', userID: 'U-7' })
    expect(logged.warnings()).toEqual([])
  })
})

// ─── A page that is no longer there ─────────────────────────────────────────

describe('a page past the last one, under DRF', () => {
  const parts = createCollectionApi<Part, PartFilters>({
    resource: 'parts',
    schema: partSchema,
    keys: defineQueryKeys('parts'),
    dialect: dialects.drf,
  })

  const invalidPage = () => HttpResponse.json({ detail: 'Invalid page.' }, { status: 404 })

  function serve(pages: Part[][], count: number) {
    server.use(
      http.get('*/api/parts/', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? 1)
        const rows = pages[page - 1]
        if (rows === undefined) return invalidPage()
        return HttpResponse.json({
          count,
          next: page < pages.length ? `http://api.test/parts/?page=${page + 1}` : null,
          previous: page > 1 ? `http://api.test/parts/?page=${page - 1}` : null,
          results: rows,
        })
      }),
    )
  }

  it('is an empty page, as on any other backend, once the first page proves it', async () => {
    // Two rows a page; the only row of page 3 was just deleted.
    serve(
      [
        [bolt, { ...bolt, id: 'P-2' }],
        [
          { ...bolt, id: 'P-3' },
          { ...bolt, id: 'P-4' },
        ],
      ],
      4,
    )
    recordWire()
    const list = withQueryClient(() => parts.useList(ref<PartFilters>({ page: 3, pageSize: 2 })))
    await vi.waitFor(() => expect(list.isPending.value).toBe(false), { timeout: 5_000 })

    expect(list.isError.value).toBe(false)
    expect(list.items.value).toEqual([])
    // The totals are the backend's own, read from its first page.
    expect(list.meta.value).toEqual({ total: 4, page: 3, pageSize: 2, totalPages: 2 })
    expect(wire).toEqual([
      'GET /api/parts/?page=3&page_size=2',
      'GET /api/parts/?page=1&page_size=2',
    ])
  })

  it('stays a 404 when the first page is not there either: the URL is wrong', async () => {
    server.use(http.get('*/api/parts/', invalidPage))
    recordWire()
    const list = withQueryClient(() => parts.useList(ref<PartFilters>({ page: 3, pageSize: 2 })))
    await vi.waitFor(() => expect(list.isError.value).toBe(true), { timeout: 5_000 })

    expect(list.error.value).toMatchObject({ status: 404, kind: 'http' })
    expect(wire).toHaveLength(2)
  })

  it('stays a 404 when the first page says the page asked for exists', async () => {
    server.use(
      http.get('*/api/parts/', ({ request }) =>
        new URL(request.url).searchParams.get('page') === '1'
          ? HttpResponse.json({
              count: 40,
              next: 'http://api.test/parts/?page=2',
              previous: null,
              results: [bolt, { ...bolt, id: 'P-2' }],
            })
          : invalidPage(),
      ),
    )
    const list = withQueryClient(() => parts.useList(ref<PartFilters>({ page: 3, pageSize: 2 })))
    await vi.waitFor(() => expect(list.isError.value).toBe(true), { timeout: 5_000 })

    expect(list.error.value).toMatchObject({ status: 404 })
  })

  it('asks nothing more about a first page that is a 404', async () => {
    server.use(http.get('*/api/parts/', invalidPage))
    recordWire()
    const list = withQueryClient(() => parts.useList(ref<PartFilters>({ page: 1 })))
    await vi.waitFor(() => expect(list.isError.value).toBe(true), { timeout: 5_000 })

    expect(wire).toEqual(['GET /api/parts/?page=1'])
  })

  it('is still an error under a dialect that does not say it is one', async () => {
    const laravelParts = createCollectionApi<Part, PartFilters>({
      resource: 'parts',
      schema: partSchema,
      keys: defineQueryKeys('parts'),
      dialect: dialects.laravel,
    })
    server.use(http.get('*/api/parts', invalidPage))
    recordWire()
    const list = withQueryClient(() => laravelParts.useList(ref<PartFilters>({ page: 3 })))
    await vi.waitFor(() => expect(list.isError.value).toBe(true), { timeout: 5_000 })

    expect(wire).toEqual(['GET /api/parts?page=3'])
  })
})
