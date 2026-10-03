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
import { defineCollectionDialect, dialects, extendDialect } from '@/lib/api/dialects'
import { resolveApiIntegration, type ApiOverrides } from '@/lib/api/integration'
import { presets } from '@/lib/api/presets'
import { AppError } from '@/lib/errors'
import { defineQueryKeys } from '@/lib/query-keys'
import { __resetRuntimeSlots, installApiIntegration } from '@/lib/runtime'

import { withQueryClient } from '../../utils/query-client'
import { resetRuntimeState } from '../../utils/reset-runtime-state'

/**
 * `createCollectionApi` against backends that are not Vuestrata's own: the
 * whole of list, detail, create, update and delete, with the requests asserted
 * as they reach the network and the results as the app sees them.
 *
 * The backends are msw handlers answering with each framework's documented
 * envelope. What the default dialect does is pinned separately, in
 * `collection-default-wire.test.ts`.
 */

interface WireEntry {
  request: string
  body: unknown
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
        request: `${request.method} ${url.pathname}${decodeURIComponent(url.search)}`,
        body: text === '' ? null : JSON.parse(text),
      })
    }),
  )
}

/** The first request of each kind: writes invalidate the reads, which then refetch. */
function firstOfEach(): WireEntry[] {
  return [...new Map(wire.map((entry) => [entry.request, entry])).values()]
}

/** Install what a project's `api.overrides.ts` would resolve to. */
function configure(overrides: ApiOverrides) {
  installApiIntegration(resolveApiIntegration(overrides))
}

async function settled(...queries: { isPending: { value: boolean } }[]) {
  await vi.waitFor(
    () => {
      for (const query of queries) expect(query.isPending.value).toBe(false)
    },
    { timeout: 5_000 },
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
afterEach(async () => {
  server.resetHandlers()
  __resetRuntimeSlots()
  await resetRuntimeState()
})
afterAll(() => server.close())

// ─── Laravel, snake_case on the wire, camelCase in the app ──────────────────

interface Customer {
  id: string
  contactName: string
  billingAddress: { postalCode: string }
  createdAt: string
}

interface CustomerFilters extends CollectionFilters {
  status?: string[]
  accountManager?: string
}

const customerSchema: z.ZodType<Customer> = z.object({
  // Laravel's ids are integers; the app's are strings.
  id: z.coerce.string(),
  contactName: z.string(),
  billingAddress: z.object({ postalCode: z.string() }),
  createdAt: z.string(),
})

type CustomerDraft = Omit<Customer, 'id' | 'createdAt'>

const customers = createCollectionApi<
  Customer,
  CustomerFilters,
  CustomerDraft,
  Partial<CustomerDraft>
>({
  resource: 'customers',
  schema: customerSchema,
  keys: defineQueryKeys('customers'),
})

const adaOnTheWire = {
  id: 7,
  contact_name: 'Ada Lovelace',
  billing_address: { postal_code: 'N1 9GU' },
  created_at: '2026-01-05T10:00:00Z',
}
const ada: Customer = {
  id: '7',
  contactName: 'Ada Lovelace',
  billingAddress: { postalCode: 'N1 9GU' },
  createdAt: '2026-01-05T10:00:00Z',
}

describe('a Laravel backend in snake_case', () => {
  beforeEach(() =>
    configure({
      backend: presets.laravel,
      collection: extendDialect(dialects.laravel, { keys: 'camel' }),
    }),
  )

  it('lists, reads, creates, updates and removes', async () => {
    server.use(
      http.get('*/api/customers', () =>
        // https://laravel.com/docs/eloquent-resources#pagination
        HttpResponse.json({
          data: [adaOnTheWire],
          links: { first: 'http://x/customers?page=1', last: null, prev: null, next: null },
          meta: { current_page: 2, from: 6, last_page: 3, per_page: 5, to: 10, total: 12 },
        }),
      ),
      http.get('*/api/customers/:id', () => HttpResponse.json({ data: adaOnTheWire })),
      http.post('*/api/customers', () =>
        HttpResponse.json({ data: { ...adaOnTheWire, id: 8 } }, { status: 201 }),
      ),
      http.patch('*/api/customers/:id', () =>
        HttpResponse.json({ data: { ...adaOnTheWire, contact_name: 'Ada King' } }),
      ),
      http.delete('*/api/customers/:id', () => new HttpResponse(null, { status: 204 })),
    )
    recordWire()
    const api = withQueryClient(() => ({
      list: customers.useList(
        ref<CustomerFilters>({
          page: 2,
          pageSize: 5,
          search: 'ada',
          sortBy: 'contactName',
          sortOrder: 'desc',
          status: ['active', 'lead'],
          accountManager: 'U-3',
        }),
      ),
      detail: customers.useDetail('7'),
      create: customers.useCreate(),
      update: customers.useUpdate(),
      remove: customers.useRemove(),
    }))
    await settled(api.list, api.detail)

    const draft: CustomerDraft = {
      contactName: 'Ada Lovelace',
      billingAddress: { postalCode: 'N1 9GU' },
    }
    const created = await api.create.mutateAsync(draft)
    const updated = await api.update.mutateAsync({ id: '7', patch: { contactName: 'Ada King' } })
    await api.remove.mutateAsync('7')

    expect(firstOfEach()).toEqual([
      {
        request:
          'GET /api/customers?page=2&per_page=5&search=ada&sort=-contact_name' +
          '&status[]=active&status[]=lead&account_manager=U-3',
        body: null,
      },
      { request: 'GET /api/customers/7', body: null },
      {
        request: 'POST /api/customers',
        body: { contact_name: 'Ada Lovelace', billing_address: { postal_code: 'N1 9GU' } },
      },
      { request: 'PATCH /api/customers/7', body: { contact_name: 'Ada King' } },
      { request: 'DELETE /api/customers/7', body: null },
    ])
    expect(api.list.items.value).toEqual([ada])
    expect(api.list.meta.value).toEqual({ total: 12, page: 2, pageSize: 5, totalPages: 3 })
    expect(api.detail.item.value).toEqual(ada)
    expect(created).toEqual({ ...ada, id: '8' })
    expect(updated).toEqual({ ...ada, contactName: 'Ada King' })
  })

  it('reports a broken row and a broken record by their paths in the app', async () => {
    server.use(
      http.get('*/api/customers', () =>
        HttpResponse.json({
          data: [adaOnTheWire, { id: 8, contact_name: 9, billing_address: {} }],
          meta: { current_page: 1, last_page: 1, per_page: 15, total: 2 },
        }),
      ),
      http.get('*/api/customers/:id', () => HttpResponse.json({ data: { id: 7 } })),
    )
    const api = withQueryClient(() => ({
      list: customers.useList(ref({})),
      detail: customers.useDetail('7'),
    }))

    await vi.waitFor(
      () => {
        expect(api.list.error.value).toBeTruthy()
        expect(api.detail.error.value).toBeTruthy()
      },
      { timeout: 5_000 },
    )

    const listError = api.list.error.value as AppError
    expect(listError).toBeInstanceOf(AppError)
    expect(listError).toMatchObject({ code: 'CONTRACT_MISMATCH', kind: 'contract' })
    // camelCase, as the schema and the form name them: not `contact_name`.
    expect(Object.keys(listError.details ?? {})).toEqual([
      'data.1.contactName',
      'data.1.billingAddress.postalCode',
      'data.1.createdAt',
    ])
    expect(Object.keys((api.detail.error.value as AppError).details ?? {})).toEqual([
      'contactName',
      'billingAddress',
      'createdAt',
    ])
  })

  it('reports an envelope it does not know by what the app expected of it', async () => {
    server.use(
      http.get('*/api/customers', () =>
        HttpResponse.json({ content: [adaOnTheWire], totalElements: 1 }),
      ),
    )
    const list = withQueryClient(() => customers.useList(ref({})))

    await vi.waitFor(() => expect(list.error.value).toBeTruthy(), { timeout: 5_000 })

    expect(list.error.value).toMatchObject({ code: 'CONTRACT_MISMATCH' })
    expect(Object.keys((list.error.value as AppError).details ?? {})).toEqual([
      'data',
      'meta.total',
      'meta.page',
      'meta.pageSize',
      'meta.totalPages',
    ])
  })

  it('reads a created record back when the 201 carried only its id', async () => {
    server.use(
      http.post('*/api/customers', () => HttpResponse.json({ data: { id: 9 } }, { status: 201 })),
      http.get('*/api/customers/:id', () =>
        HttpResponse.json({ data: { ...adaOnTheWire, id: 9 } }),
      ),
    )
    recordWire()
    const create = withQueryClient(() => customers.useCreate())

    const saved = await create.mutateAsync({
      contactName: 'Ada Lovelace',
      billingAddress: { postalCode: 'N1 9GU' },
    })

    expect(wire.map((entry) => entry.request)).toEqual([
      'POST /api/customers',
      'GET /api/customers/9',
    ])
    expect(saved).toEqual({ ...ada, id: '9' })
  })

  it('leaves the errors of a refused write as the backend spelled them', async () => {
    server.use(
      http.post('*/api/customers', () =>
        HttpResponse.json(
          {
            message: 'The contact name field is required.',
            errors: { contact_name: ['The contact name field is required.'] },
          },
          { status: 422 },
        ),
      ),
    )
    const create = withQueryClient(() => customers.useCreate())

    const error = await create
      .mutateAsync({ contactName: '', billingAddress: { postalCode: '' } })
      .then(
        () => undefined,
        (reason: unknown) => reason as AppError,
      )

    // The form layer maps these to its fields; renaming them here would
    // leave it nothing to map from.
    expect(error?.details).toEqual({ contact_name: ['The contact name field is required.'] })
  })
})

describe('a dictionary under a key transform', () => {
  interface Product {
    id: string
    displayName: string
    prices: Record<string, number>
    translations: Record<string, { shortTitle: string }>
    settings?: unknown
  }

  const products = createCollectionApi<Product, CollectionFilters, Omit<Product, 'id'>>({
    resource: 'products',
    schema: z.object({
      id: z.string(),
      displayName: z.string(),
      prices: z.record(z.string(), z.number()),
      translations: z.record(z.string(), z.object({ shortTitle: z.string() })),
      settings: z.unknown().optional(),
    }),
    keys: defineQueryKeys('products'),
    dialect: extendDialect(dialects.laravel, { keys: 'camel' }),
  })

  const onTheWire = {
    id: 'P-1',
    display_name: 'Bolt',
    prices: { eur_cents: 1200, usd_cents: 1300 },
    translations: { pt_BR: { short_title: 'Parafuso' } },
    settings: { ui_theme: 'dark' },
  }

  it('keeps the keys the schema says are data, in both directions', async () => {
    server.use(
      http.get('*/api/products/:id', () => HttpResponse.json({ data: onTheWire })),
      http.post('*/api/products', () => HttpResponse.json({ data: onTheWire }, { status: 201 })),
    )
    recordWire()
    const api = withQueryClient(() => ({
      detail: products.useDetail('P-1'),
      create: products.useCreate(),
    }))
    await settled(api.detail)

    const product = api.detail.item.value
    expect(product).toEqual({
      id: 'P-1',
      displayName: 'Bolt',
      prices: { eur_cents: 1200, usd_cents: 1300 },
      translations: { pt_BR: { shortTitle: 'Parafuso' } },
      settings: { ui_theme: 'dark' },
    })

    const { id: _id, ...draft } = product as Product
    await api.create.mutateAsync(draft)

    const { id: _wireId, ...draftOnTheWire } = onTheWire
    expect(wire.find((entry) => entry.request === 'POST /api/products')?.body).toEqual(
      draftOnTheWire,
    )
  })
})

// ─── Django REST Framework, as the project's default ────────────────────────

interface Account {
  id: number
  name: string
  owner_email: string
}

interface AccountFilters extends CollectionFilters {
  status?: string[]
}

// Created before anything is configured, as a module's collection is: the
// dialect is the project's at the time of each call.
const accounts = createCollectionApi<Account, AccountFilters, Omit<Account, 'id'>>({
  resource: 'accounts',
  schema: z.object({ id: z.number(), name: z.string(), owner_email: z.string() }),
  keys: defineQueryKeys('accounts'),
})

const acme: Account = { id: 7, name: 'Acme', owner_email: 'ops@acme.test' }

describe('a Django REST Framework backend', () => {
  beforeEach(() => configure({ backend: presets.django }))

  it('lists, reads, creates, updates and removes', async () => {
    server.use(
      http.get('*/api/accounts/', () =>
        // https://www.django-rest-framework.org/api-guide/pagination/#pagenumberpagination
        HttpResponse.json({
          count: 8,
          next: 'https://api.example.org/accounts/?page=3',
          previous: 'https://api.example.org/accounts/?page=1',
          results: [acme, { ...acme, id: 8 }, { ...acme, id: 9 }],
        }),
      ),
      http.get('*/api/accounts/:id/', () => HttpResponse.json(acme)),
      http.post('*/api/accounts/', () => HttpResponse.json({ ...acme, id: 10 }, { status: 201 })),
      // DRF's default for a PATCH is the record; a 204 is what a custom view gives.
      http.patch('*/api/accounts/:id/', () => new HttpResponse(null, { status: 204 })),
      http.delete('*/api/accounts/:id/', () => new HttpResponse(null, { status: 204 })),
    )
    recordWire()
    const { queryClient, ...api } = withQueryClient((client) => ({
      list: accounts.useList(
        ref<AccountFilters>({
          page: 2,
          pageSize: 3,
          search: 'ac',
          sortBy: 'name',
          sortOrder: 'desc',
          status: ['open', 'late'],
        }),
      ),
      detail: accounts.useDetail('7'),
      create: accounts.useCreate(),
      update: accounts.useUpdate(),
      remove: accounts.useRemove(),
      queryClient: client,
    }))
    await settled(api.list, api.detail)

    const created = await api.create.mutateAsync({ name: 'Acme', owner_email: 'ops@acme.test' })
    const updated = await api.update.mutateAsync({ id: '7', patch: { name: 'Acme Ltd' } })
    await api.remove.mutateAsync('7')

    expect(firstOfEach()).toEqual([
      {
        request:
          'GET /api/accounts/?page=2&page_size=3&search=ac&ordering=-name&status=open&status=late',
        body: null,
      },
      { request: 'GET /api/accounts/7/', body: null },
      { request: 'POST /api/accounts/', body: { name: 'Acme', owner_email: 'ops@acme.test' } },
      { request: 'PATCH /api/accounts/7/', body: { name: 'Acme Ltd' } },
      { request: 'DELETE /api/accounts/7/', body: null },
    ])
    expect(api.list.items.value).toHaveLength(3)
    // DRF names neither the page nor its size: both come from the request.
    expect(api.list.meta.value).toEqual({ total: 8, page: 2, pageSize: 3, totalPages: 3 })
    expect(api.detail.item.value).toEqual(acme)
    expect(created).toEqual({ ...acme, id: 10 })
    // Read back after the empty 204, from the path with its trailing slash.
    expect(updated).toEqual(acme)
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toEqual([
      [
        'accounts',
        'list',
        {
          page: '2',
          page_size: '3',
          search: 'ac',
          ordering: '-name',
          status: ['open', 'late'],
        },
      ],
      ['accounts', 'detail', '7'],
    ])
  })

  it('reads an empty list as one empty page', async () => {
    server.use(
      http.get('*/api/accounts/', () =>
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )
    const list = withQueryClient(() => accounts.useList(ref({ page: 1, pageSize: 10 })))
    await settled(list)

    expect(list.items.value).toEqual([])
    expect(list.meta.value).toEqual({ total: 0, page: 1, pageSize: 10, totalPages: 1 })
  })

  it('reads LimitOffsetPagination when the project names it', async () => {
    configure({ backend: presets.django, collection: dialects.drfLimitOffset })
    server.use(
      http.get('*/api/accounts/', () =>
        HttpResponse.json({
          count: 8,
          next: null,
          previous: 'https://api.example.org/accounts/?limit=3&offset=3',
          results: [acme, { ...acme, id: 8 }],
        }),
      ),
    )
    recordWire()
    const list = withQueryClient(() => accounts.useList(ref({ page: 3, pageSize: 3 })))
    await settled(list)

    expect(wire.map((entry) => entry.request)).toEqual(['GET /api/accounts/?offset=6&limit=3'])
    expect(list.meta.value).toEqual({ total: 8, page: 3, pageSize: 3, totalPages: 3 })
  })
})

// ─── Spring Data, named by one collection ───────────────────────────────────

interface Part {
  id: string
  name: string
  stock: number
}

interface PartFilters extends CollectionFilters {
  sort?: { field: string; direction?: 'asc' | 'desc' }[]
  warehouse?: string[]
  made?: { from: string; to: string }
}

const partSchema = z.object({ id: z.string(), name: z.string(), stock: z.number().int() })

const parts = createCollectionApi<Part, PartFilters, Omit<Part, 'id'>, Part>({
  resource: 'parts',
  schema: partSchema,
  keys: defineQueryKeys('parts'),
  dialect: dialects.spring,
  // This controller maps PUT only, and is given the whole record.
  updateMethod: 'PUT',
})

const bolt: Part = { id: 'P-1', name: 'Bolt', stock: 40 }

describe('a Spring Data backend', () => {
  function springPage(content: Part[], number: number, totalElements: number, size = 20) {
    // https://docs.spring.io/spring-data/commons/reference/repositories/core-extensions.html
    return HttpResponse.json({
      content,
      pageable: { pageNumber: number, pageSize: size, offset: number * size, paged: true },
      last: (number + 1) * size >= totalElements,
      totalPages: Math.ceil(totalElements / size),
      totalElements,
      size,
      number,
      first: number === 0,
      numberOfElements: content.length,
      empty: content.length === 0,
    })
  }

  it('lists, reads, creates, updates and removes', async () => {
    server.use(
      http.get('*/api/parts', () => springPage([bolt], 1, 41)),
      http.get('*/api/parts/:id', () => HttpResponse.json(bolt)),
      http.post('*/api/parts', () => HttpResponse.json({ ...bolt, id: 'P-2' }, { status: 201 })),
      http.put('*/api/parts/:id', () => HttpResponse.json({ ...bolt, stock: 41 })),
      http.delete('*/api/parts/:id', () => new HttpResponse(null, { status: 204 })),
    )
    recordWire()
    const api = withQueryClient(() => ({
      list: parts.useList(
        ref<PartFilters>({
          page: 2,
          pageSize: 20,
          search: 'bo',
          sortBy: 'name',
          sortOrder: 'desc',
          warehouse: ['north', 'south'],
          made: { from: '2026-01-01', to: '2026-02-01' },
        }),
      ),
      detail: parts.useDetail('P-1'),
      create: parts.useCreate(),
      update: parts.useUpdate(),
      remove: parts.useRemove(),
    }))
    await settled(api.list, api.detail)

    const created = await api.create.mutateAsync({ name: 'Bolt', stock: 40 })
    const updated = await api.update.mutateAsync({ id: 'P-1', patch: { ...bolt, stock: 41 } })
    await api.remove.mutateAsync('P-1')

    expect(firstOfEach()).toEqual([
      {
        // The second page is page 1 to Spring.
        request:
          'GET /api/parts?page=1&size=20&search=bo&sort=name,desc' +
          '&warehouse=north&warehouse=south&made.from=2026-01-01&made.to=2026-02-01',
        body: null,
      },
      { request: 'GET /api/parts/P-1', body: null },
      { request: 'POST /api/parts', body: { name: 'Bolt', stock: 40 } },
      { request: 'PUT /api/parts/P-1', body: { ...bolt, stock: 41 } },
      { request: 'DELETE /api/parts/P-1', body: null },
    ])
    expect(api.list.items.value).toEqual([bolt])
    expect(api.list.meta.value).toEqual({ total: 41, page: 2, pageSize: 20, totalPages: 3 })
    expect(api.detail.item.value).toEqual(bolt)
    expect(created).toEqual({ ...bolt, id: 'P-2' })
    expect(updated).toEqual({ ...bolt, stock: 41 })
  })

  it('sends several sort columns, each as its own parameter', async () => {
    server.use(http.get('*/api/parts', () => springPage([], 0, 0)))
    recordWire()
    const list = withQueryClient(() =>
      parts.useList(
        ref<PartFilters>({
          page: 1,
          sort: [{ field: 'stock', direction: 'desc' }, { field: 'name' }],
        }),
      ),
    )
    await settled(list)

    expect(wire.map((entry) => entry.request)).toEqual([
      'GET /api/parts?page=0&sort=stock,desc&sort=name,asc',
    ])
    // An empty Page reports zero pages; the app shows one empty page.
    expect(list.meta.value).toEqual({ total: 0, page: 1, pageSize: 20, totalPages: 1 })
  })

  it('keeps its own dialect whatever the project configures', async () => {
    configure({ backend: presets.laravel })
    server.use(http.get('*/api/parts', () => springPage([bolt], 0, 1)))
    recordWire()
    const list = withQueryClient(() => parts.useList(ref<PartFilters>({ page: 1, pageSize: 20 })))
    await settled(list)

    expect(wire.map((entry) => entry.request)).toEqual(['GET /api/parts?page=0&size=20'])
    expect(list.items.value).toEqual([bolt])
  })
})

// ─── Which dialect a collection speaks ──────────────────────────────────────

describe('dialect resolution', () => {
  const widgets = createCollectionApi<Part>({
    resource: 'widgets',
    schema: partSchema,
    keys: defineQueryKeys('widgets'),
  })

  it('is the vuestrata dialect when nothing names one', async () => {
    server.use(
      http.get('*/api/widgets', () =>
        HttpResponse.json({
          data: [bolt],
          meta: { total: 1, page: 1, pageSize: 10, totalPages: 1 },
        }),
      ),
    )
    recordWire()
    const list = withQueryClient(() =>
      widgets.useList(ref({ page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc' as const })),
    )
    await settled(list)

    expect(wire.map((entry) => entry.request)).toEqual([
      'GET /api/widgets?page=1&pageSize=10&sortBy=name&sortOrder=asc',
    ])
    expect(list.items.value).toEqual([bolt])
  })

  it('is the vuestrata dialect under a preset that names none', async () => {
    configure({ backend: presets.aspnet })
    server.use(
      http.get('*/api/widgets', () =>
        HttpResponse.json({
          data: [bolt],
          meta: { total: 1, page: 1, pageSize: 10, totalPages: 1 },
        }),
      ),
    )
    recordWire()
    const list = withQueryClient(() => widgets.useList(ref({ page: 1, pageSize: 10 })))
    await settled(list)

    expect(wire.map((entry) => entry.request)).toEqual(['GET /api/widgets?page=1&pageSize=10'])
  })

  it('is the project dialect once one is configured, for a collection made before', async () => {
    configure({ collection: dialects.spring })
    server.use(
      http.get('*/api/widgets', () =>
        HttpResponse.json({
          content: [bolt],
          totalElements: 1,
          totalPages: 1,
          size: 10,
          number: 0,
        }),
      ),
    )
    recordWire()
    const list = withQueryClient(() => widgets.useList(ref({ page: 1, pageSize: 10 })))
    await settled(list)

    expect(wire.map((entry) => entry.request)).toEqual(['GET /api/widgets?page=0&size=10'])
    expect(list.meta.value).toEqual({ total: 1, page: 1, pageSize: 10, totalPages: 1 })
  })

  it('takes a dialect written in the project, with the list total in a header', async () => {
    const jsonServer = defineCollectionDialect({
      name: 'json-server',
      query: { page: '_page', pageSize: '_limit', search: 'q', arrays: 'repeat' },
      parseList: (raw, { page, pageSize, headers }) => ({
        items: raw,
        meta: {
          total: Number(headers?.get('x-total-count')),
          page,
          pageSize,
          totalPages: Math.max(
            1,
            Math.ceil(Number(headers?.get('x-total-count')) / (pageSize ?? 1)),
          ),
        },
      }),
    })
    const notes = createCollectionApi<Part>({
      resource: 'notes',
      schema: partSchema,
      keys: defineQueryKeys('notes'),
      dialect: jsonServer,
    })
    server.use(
      http.get('*/api/notes', () =>
        HttpResponse.json([bolt], { headers: { 'X-Total-Count': '21' } }),
      ),
    )
    recordWire()
    const list = withQueryClient(() =>
      notes.useList(ref({ page: 2, pageSize: 10, search: 'bo', sortBy: 'name' })),
    )
    await settled(list)

    expect(wire.map((entry) => entry.request)).toEqual([
      'GET /api/notes?_page=2&_limit=10&q=bo&sortBy=name',
    ])
    expect(list.items.value).toEqual([bolt])
    expect(list.meta.value).toEqual({ total: 21, page: 2, pageSize: 10, totalPages: 3 })
  })

  it('fails a filter the dialect cannot write where it was asked for, not on the wire', () => {
    const strict = createCollectionApi<Part, PartFilters>({
      resource: 'strict',
      schema: partSchema,
      keys: defineQueryKeys('strict'),
      dialect: dialects.drf,
    })
    const errors = vi.spyOn(console, 'warn').mockImplementation(() => {})
    recordWire()

    expect(() =>
      withQueryClient(() => {
        const list = strict.useList(ref<PartFilters>({ made: { from: 'a', to: 'b' } }))
        // The key is what reads the filters.
        return list.items.value
      }),
    ).toThrow(/"drf" collection dialect cannot send the filter "made"/)
    expect(wire).toEqual([])

    errors.mockRestore()
  })

  it('refuses to page a cursor dialect by number', async () => {
    const feed = createCollectionApi<Part>({
      resource: 'feed',
      schema: partSchema,
      keys: defineQueryKeys('feed'),
      dialect: dialects.drfCursor,
    })
    recordWire()
    const list = withQueryClient(() => feed.useList(ref({})))

    await vi.waitFor(() => expect(list.error.value).toBeTruthy(), { timeout: 5_000 })

    expect(list.error.value?.message).toMatch(/pages by cursor.*useInfiniteList/)
    expect(wire).toEqual([])
  })
})

// ─── Paths ──────────────────────────────────────────────────────────────────

describe('a collection at its own path', () => {
  it('uses the path in place of /{resource}', async () => {
    const orders = createCollectionApi<Part>({
      resource: 'orders',
      path: '/v2/sales/orders',
      schema: partSchema,
      keys: defineQueryKeys('orders'),
    })
    server.use(
      http.get('*/api/v2/sales/orders/:id', () => HttpResponse.json(bolt)),
      http.delete('*/api/v2/sales/orders/:id', () => new HttpResponse(null, { status: 204 })),
    )
    recordWire()
    const api = withQueryClient(() => ({
      detail: orders.useDetail('P-1'),
      remove: orders.useRemove(),
    }))
    await settled(api.detail)
    await api.remove.mutateAsync('P-1')

    expect(firstOfEach().map((entry) => entry.request)).toEqual([
      'GET /api/v2/sales/orders/P-1',
      'DELETE /api/v2/sales/orders/P-1',
    ])
  })
})

describe('a nested resource', () => {
  interface Contact {
    id: string
    name: string
  }

  const contactSchema = z.object({ id: z.string(), name: z.string() })
  const contactKeys = defineQueryKeys('contacts')

  const contacts = createCollectionApi<
    Contact,
    CollectionFilters,
    Omit<Contact, 'id'>,
    Partial<Contact>,
    { customerId: string }
  >({
    resource: 'contacts',
    path: ({ customerId }) => `/customers/${customerId}/contacts`,
    schema: contactSchema,
    keys: contactKeys,
  })

  const grace: Contact = { id: 'K-1', name: 'Grace' }

  function serveContacts() {
    server.use(
      http.get('*/api/customers/:customerId/contacts', ({ params }) =>
        HttpResponse.json({
          data: [{ ...grace, name: `Grace of ${String(params.customerId)}` }],
          meta: { total: 1, page: 1, pageSize: 10, totalPages: 1 },
        }),
      ),
      http.get('*/api/customers/:customerId/contacts/:id', () => HttpResponse.json(grace)),
      http.post('*/api/customers/:customerId/contacts', () =>
        HttpResponse.json({ ...grace, id: 'K-2' }, { status: 201 }),
      ),
      http.patch('*/api/customers/:customerId/contacts/:id', () => HttpResponse.json(grace)),
      http.delete(
        '*/api/customers/:customerId/contacts/:id',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
  }

  it('asks for nothing until its parent is known, then under the parent', async () => {
    serveContacts()
    recordWire()
    const customerId = ref<string | undefined>(undefined)
    const { queryClient, ...api } = withQueryClient((client) => {
      const scoped = contacts.within(() => ({ customerId: customerId.value as string }))
      return {
        list: scoped.useList(ref({ page: 1 })),
        detail: scoped.useDetail('K-1'),
        create: scoped.useCreate(),
        update: scoped.useUpdate(),
        remove: scoped.useRemove(),
        queryClient: client,
      }
    })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(wire).toEqual([])
    await expect(api.create.mutateAsync({ name: 'Grace' })).rejects.toThrow(
      /before its parent was known/,
    )

    customerId.value = 'C-1'
    await settled(api.list, api.detail)
    await api.create.mutateAsync({ name: 'Grace' })
    await api.update.mutateAsync({ id: 'K-1', patch: { name: 'Grace H.' } })
    await api.remove.mutateAsync('K-1')

    expect(firstOfEach()).toEqual([
      { request: 'GET /api/customers/C-1/contacts?page=1', body: null },
      { request: 'GET /api/customers/C-1/contacts/K-1', body: null },
      { request: 'POST /api/customers/C-1/contacts', body: { name: 'Grace' } },
      { request: 'PATCH /api/customers/C-1/contacts/K-1', body: { name: 'Grace H.' } },
      { request: 'DELETE /api/customers/C-1/contacts/K-1', body: null },
    ])
    expect(api.list.items.value).toEqual([{ id: 'K-1', name: 'Grace of C-1' }])
    const cachedKeys = () =>
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey)
    // Under the collection's own key, which a write invalidates, and per parent.
    expect(cachedKeys()).toEqual([
      ['contacts', 'within', { customerId: 'C-1' }, 'list', { page: '1' }],
      ['contacts', 'within', { customerId: 'C-1' }, 'detail', 'K-1'],
    ])

    // Another parent is another list, cached apart from the first.
    customerId.value = 'C-2'
    await vi.waitFor(
      () => expect(api.list.items.value).toEqual([{ id: 'K-1', name: 'Grace of C-2' }]),
      { timeout: 5_000 },
    )
    expect(cachedKeys()).toContainEqual([
      'contacts',
      'within',
      { customerId: 'C-2' },
      'list',
      { page: '1' },
    ])
  })

  it('says how to read it when it is read without a parent', async () => {
    recordWire()
    const api = withQueryClient(() => ({
      list: contacts.useList(ref({})),
      create: contacts.useCreate(),
    }))

    await vi.waitFor(() => expect(api.list.error.value).toBeTruthy(), { timeout: 5_000 })

    expect(api.list.error.value?.message).toMatch(/nested.*within\(parent\)/)
    await expect(api.create.mutateAsync({ name: 'x' })).rejects.toThrow(/nested.*within\(parent\)/)
    expect(wire).toEqual([])
  })

  it('takes the trailing slash of its dialect', async () => {
    const drfContacts = createCollectionApi<
      Contact,
      CollectionFilters,
      Omit<Contact, 'id'>,
      Partial<Contact>,
      { customerId: string }
    >({
      resource: 'contacts',
      path: ({ customerId }) => `/customers/${customerId}/contacts`,
      schema: contactSchema,
      keys: contactKeys,
      dialect: dialects.drf,
    })
    server.use(
      http.get('*/api/customers/:customerId/contacts/:id/', () => HttpResponse.json(grace)),
    )
    recordWire()
    const detail = withQueryClient(() => drfContacts.within({ customerId: 'C-1' }).useDetail('K-1'))
    await settled(detail)

    expect(wire.map((entry) => entry.request)).toEqual(['GET /api/customers/C-1/contacts/K-1/'])
  })
})
