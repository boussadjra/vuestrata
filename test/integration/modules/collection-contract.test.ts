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

import { installValidationMessages } from '@/bootstrap/validation-messages'
import { installApiAuth } from '@/lib/api/client'
import { AppError } from '@/lib/errors'
import { createMockJwt } from '@/mocks/utils'
import {
  useCreateCustomerMutation,
  useCustomerQuery,
  useCustomersQuery,
  useDeleteCustomerMutation,
  useUpdateCustomerMutation,
} from '@/modules/customers/composables/useCustomers'
import { customersHandlers, resetCustomersMock } from '@/modules/customers/mocks/customers.handlers'
import { customersModuleKeys } from '@/modules/customers/query-keys'
import { customerSchema, type CustomerDraft } from '@/modules/customers/types'
import { getI18n } from '@/plugins/i18n'

import { withQueryClient } from '../../utils/query-client'

/**
 * The shared collection contract.
 *
 * Eight domain modules are served by `createCollectionMock` and consumed by
 * `createCollectionApi`. Both ends assume the same query parameters and the same
 * `{ data, meta }` envelope, so a defect here is a defect in every domain at
 * once. Customers stands in for all of them: it is the only one that needs its
 * own end-to-end coverage, because the machinery is identical.
 */

const server = setupServer(...customersHandlers)
const token = createMockJwt({ sub: '1', expiresInSeconds: 3600 })

const listSchema = z.object({
  data: z.array(customerSchema),
  meta: z.object({
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
    totalPages: z.number().int(),
  }),
})

async function request(
  path: string,
  init: Omit<RequestInit, 'headers'> = {},
): Promise<{ status: number; body: unknown }> {
  // Headers are fixed rather than merged: `RequestInit['headers']` may be a
  // `Headers`, an array of pairs, or a record, and object-spreading the first
  // two silently produces `{ 0: [...], 1: [...] }`. No test here needs a
  // different header set, so the union is simply not accepted.
  const response = await fetch(`http://localhost/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  return { status: response.status, body: response.status === 204 ? null : await response.json() }
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Writes mutate the handler's in-memory records; without this a create in one
// test changes the totals another test asserts on, and the failure appears in
// whichever test happens to run second.
beforeEach(() => resetCustomersMock())

describe('list envelope', () => {
  it('matches the schema the query validates against', async () => {
    const { status, body } = await request('/customers')
    expect(status).toBe(200)
    expect(() => listSchema.parse(body)).not.toThrow()
  })

  it('paginates, and the page size caps the payload', async () => {
    const { body } = await request('/customers?page=2&pageSize=5')
    const parsed = listSchema.parse(body)

    expect(parsed.data).toHaveLength(5)
    expect(parsed.meta.page).toBe(2)
    expect(parsed.meta.totalPages).toBe(Math.ceil(parsed.meta.total / 5))
  })

  it('returns disjoint pages', async () => {
    // The classic off-by-one in a slice-based pager repeats the boundary row on
    // both pages, and the only way to see it is to compare them.
    const first = listSchema.parse((await request('/customers?page=1&pageSize=5')).body)
    const second = listSchema.parse((await request('/customers?page=2&pageSize=5')).body)

    const overlap = first.data.filter((record) =>
      second.data.some((other) => other.id === record.id),
    )
    expect(overlap).toEqual([])
  })

  it('searches the declared fields, case-insensitively', async () => {
    const { body } = await request('/customers?search=NORTHWIND&pageSize=100')
    const parsed = listSchema.parse(body)

    expect(parsed.data.length).toBeGreaterThan(0)
    for (const record of parsed.data) {
      expect(record.company.toLowerCase()).toContain('northwind')
    }
  })

  it('filters by an exact field match', async () => {
    const { body } = await request('/customers?status=churned&pageSize=100')
    const parsed = listSchema.parse(body)

    expect(parsed.data.length).toBeGreaterThan(0)
    expect(parsed.data.every((record) => record.status === 'churned')).toBe(true)
  })

  it('treats an empty filter as "no filter", not as "match nothing"', async () => {
    // Clearing a select in the UI sends `status=`. Filtering on it would return
    // zero rows, which reads to the user as "no results" when they have in fact
    // just removed the filter.
    const cleared = listSchema.parse((await request('/customers?status=')).body)
    const unset = listSchema.parse((await request('/customers')).body)

    expect(cleared.meta.total).toBe(unset.meta.total)
  })

  it('sorts in both directions', async () => {
    const ascending = listSchema.parse(
      (await request('/customers?sortBy=company&sortOrder=asc')).body,
    )
    const descending = listSchema.parse(
      (await request('/customers?sortBy=company&sortOrder=desc')).body,
    )

    const names = ascending.data.map((record) => record.company)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(descending.data[0]?.company).not.toBe(ascending.data[0]?.company)
  })

  it('sorts dates chronologically rather than as strings', async () => {
    const { body } = await request('/customers?sortBy=since&sortOrder=asc&pageSize=100')
    const parsed = listSchema.parse(body)
    const times = parsed.data.map((record) => Date.parse(record.since))

    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('returns an empty page rather than an error when nothing matches', async () => {
    const { status, body } = await request('/customers?search=zzzzznomatch')
    expect(status).toBe(200)

    const parsed = listSchema.parse(body)
    expect(parsed.data).toEqual([])
    // `totalPages` floors to 0 without the guard, and a pager showing "page 1
    // of 0" looks broken.
    expect(parsed.meta.totalPages).toBe(1)
  })
})

describe('single record', () => {
  it('returns the record', async () => {
    const { status, body } = await request('/customers/CUS-1000')
    expect(status).toBe(200)
    expect(customerSchema.parse(body).id).toBe('CUS-1000')
  })

  it('404s for an unknown id', async () => {
    const { status } = await request('/customers/CUS-does-not-exist')
    expect(status).toBe(404)
  })
})

describe('writes', () => {
  const draft = {
    company: 'Test Industries',
    contactName: 'Amara Okonkwo',
    email: 'amara@test.example',
    phone: '+1 555 0000',
    status: 'prospect',
    plan: 'starter',
    city: 'Lisbon',
    country: 'PT',
    notes: '',
  }

  it('creates a record and returns it validated', async () => {
    const { status, body } = await request('/customers', {
      method: 'POST',
      body: JSON.stringify(draft),
    })

    expect(status).toBe(201)
    expect(customerSchema.parse(body).company).toBe('Test Industries')
  })

  it('makes a created record immediately visible in the list', async () => {
    const before = listSchema.parse((await request('/customers?pageSize=100')).body).meta.total
    await request('/customers', { method: 'POST', body: JSON.stringify(draft) })

    // Customers declares `defaultSort: company asc`, so the new record appears
    // in sort position rather than at the top — insertion order is only the
    // fallback for collections that declare no sort. What must hold either way
    // is that it is in the list at all, and counted.
    const after = listSchema.parse((await request('/customers?pageSize=100')).body)

    expect(after.meta.total).toBe(before + 1)
    expect(after.data.some((record) => record.company === 'Test Industries')).toBe(true)
  })

  it('rejects an invalid payload with 422', async () => {
    const { status } = await request('/customers', {
      method: 'POST',
      body: JSON.stringify({ ...draft, status: 'not-a-status' }),
    })
    expect(status).toBe(422)
  })

  it('applies a partial update without dropping untouched fields', async () => {
    const before = customerSchema.parse((await request('/customers/CUS-1000')).body)

    const { status, body } = await request('/customers/CUS-1000', {
      method: 'PATCH',
      body: JSON.stringify({ city: 'Reykjavík' }),
    })
    const after = customerSchema.parse(body)

    expect(status).toBe(200)
    expect(after.city).toBe('Reykjavík')
    expect(after.company).toBe(before.company)
    expect(after.mrr).toEqual(before.mrr)
  })

  it('deletes a record and then 404s on it', async () => {
    expect((await request('/customers/CUS-1001', { method: 'DELETE' })).status).toBe(204)
    expect((await request('/customers/CUS-1001')).status).toBe(404)
  })

  it('404s when updating or deleting an unknown id', async () => {
    expect(
      (await request('/customers/nope', { method: 'PATCH', body: JSON.stringify({ city: 'X' }) }))
        .status,
    ).toBe(404)
    expect((await request('/customers/nope', { method: 'DELETE' })).status).toBe(404)
  })
})

/**
 * The factory's end of the same wire.
 *
 * The mock answers the way this template's backend does. These tests override
 * single responses with shapes other backends legitimately use — a 204, a 201
 * that only names the record in `Location` — and a body that breaks the
 * schema, and assert what `createCollectionApi` makes of each. The requests go
 * through the real client, so the mock's bearer check applies.
 */
describe('createCollectionApi on other response shapes', () => {
  const draft: CustomerDraft = {
    company: 'Shape Shifters Ltd',
    contactName: 'Imani Diallo',
    email: 'imani@shapes.example',
    phone: '+1 555 2222',
    status: 'prospect',
    plan: 'starter',
    city: 'Dakar',
    country: 'SN',
    notes: '',
  }

  beforeEach(() => {
    installApiAuth({
      getToken: () => token,
      getRefreshToken: () => null,
      setAuth: () => {},
      clearAuth: () => {},
    })
  })

  /** Record which customers are read back, then let the collection mock answer. */
  function watchReads(): string[] {
    const reads: string[] = []
    server.use(
      http.get('*/api/customers/:id', ({ params }) => {
        reads.push(String(params.id))
        // Returning nothing falls through to the next matching handler.
      }),
    )
    return reads
  }

  it('reads the record back after a 204 on update', async () => {
    server.use(http.patch('*/api/customers/:id', () => new HttpResponse(null, { status: 204 })))
    const reads = watchReads()
    const update = withQueryClient(() => useUpdateCustomerMutation())

    const saved = await update.mutateAsync({ id: 'CUS-1000', patch: draft })

    expect(reads).toEqual(['CUS-1000'])
    expect(customerSchema.parse(saved).id).toBe('CUS-1000')
  })

  it('reads the record back from the Location of an empty 201', async () => {
    server.use(
      http.post(
        '*/api/customers',
        () =>
          new HttpResponse(null, { status: 201, headers: { Location: '/api/customers/CUS-1003' } }),
      ),
    )
    const reads = watchReads()
    const create = withQueryClient(() => useCreateCustomerMutation())

    const saved = await create.mutateAsync(draft)

    // Resolved against the URL that answered: read against the client's base
    // instead, the path would carry the `/api` prefix twice.
    expect(reads).toEqual(['CUS-1003'])
    expect(customerSchema.parse(saved).id).toBe('CUS-1003')
  })

  it('reads the record back by the id a 201 returned', async () => {
    server.use(
      http.post('*/api/customers', () => HttpResponse.json({ id: 'CUS-1004' }, { status: 201 })),
    )
    const reads = watchReads()
    const create = withQueryClient(() => useCreateCustomerMutation())

    const saved = await create.mutateAsync(draft)

    expect(reads).toEqual(['CUS-1004'])
    expect(saved.id).toBe('CUS-1004')
  })

  it('uses a body that is already the record, without reading it back', async () => {
    const reads = watchReads()
    const create = withQueryClient(() => useCreateCustomerMutation())

    const saved = await create.mutateAsync(draft)

    expect(saved.company).toBe('Shape Shifters Ltd')
    expect(reads).toEqual([])
  })

  it('reports a body that breaks the schema as CONTRACT_MISMATCH', async () => {
    server.use(
      http.get('*/api/customers/:id', () => HttpResponse.json({ id: 'CUS-1000', company: 42 })),
    )
    const detail = withQueryClient(() => useCustomerQuery(ref('CUS-1000')))

    await vi.waitFor(() => expect(detail.error.value).toBeTruthy(), { timeout: 5_000 })

    const error = detail.error.value
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({
      code: 'CONTRACT_MISMATCH',
      kind: 'contract',
      retryable: false,
      messageKey: 'errors.contract',
    })
    // The zod issues, keyed by where they are in the body.
    expect((error as AppError).details).toHaveProperty('company')
    expect((error as AppError).details).toHaveProperty('contactName')
  })

  // The details go to devtools and the error reporter. The app's localized
  // zod messages are for forms: a developer reading a report needs zod's own.
  it('describes the mismatch in zod’s English, whatever language the app is in', async () => {
    const removeMessages = installValidationMessages()
    getI18n().global.locale.value = 'ar'
    try {
      server.use(http.get('*/api/customers/:id', () => HttpResponse.json({ id: 42, company: 42 })))
      const detail = withQueryClient(() => useCustomerQuery(ref('CUS-1000')))

      await vi.waitFor(() => expect(detail.error.value).toBeTruthy(), { timeout: 5_000 })

      const details = (detail.error.value as AppError).details ?? {}
      expect(details.id).toEqual(['Invalid input: expected string, received number'])
      expect(details.company).toEqual(['Invalid input: expected string, received number'])
      for (const message of Object.values(details).flat()) {
        expect(message).not.toMatch(/[\u0600-\u06FF]/)
      }

      // While a form's schema, in the same breath, answers in Arabic.
      const form = customerSchema.safeParse({ id: 42 })
      expect(form.error!.issues[0]!.message).toMatch(/[\u0600-\u06FF]/)
    } finally {
      removeMessages()
      getI18n().global.locale.value = 'en'
    }
  })

  // The write may have happened even though its response could not be read,
  // so the lists must be refreshed either way — not only on success.
  it('still invalidates the lists when a write answers with a broken body', async () => {
    server.use(
      http.patch('*/api/customers/:id', () => HttpResponse.json({ id: 'CUS-1000', company: 42 })),
    )
    const { update, invalidateQueries } = withQueryClient((queryClient) => ({
      update: useUpdateCustomerMutation(),
      invalidateQueries: vi.spyOn(queryClient, 'invalidateQueries'),
    }))

    await expect(update.mutateAsync({ id: 'CUS-1000', patch: draft })).rejects.toMatchObject({
      code: 'CONTRACT_MISMATCH',
    })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: customersModuleKeys.all })
  })

  // A static host's SPA fallback, or a proxy's error page, answering an API
  // URL with a web page. The reads say `expectJson`, so it is named for what
  // it is before a schema ever sees a string.
  const fallbackPage = () => HttpResponse.html('<!doctype html><div id="app"></div>')

  it('reports a web page where the list was expected as UNEXPECTED_RESPONSE', async () => {
    server.use(http.get('*/api/customers', fallbackPage))
    const list = withQueryClient(() => useCustomersQuery(ref({})))

    await vi.waitFor(() => expect(list.error.value).toBeTruthy(), { timeout: 5_000 })

    expect(list.error.value).toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      kind: 'contract',
      retryable: false,
      messageKey: 'errors.unexpected_response',
    })
  })

  it('reports one where a record was expected the same way', async () => {
    server.use(http.get('*/api/customers/:id', fallbackPage))
    const detail = withQueryClient(() => useCustomerQuery(ref('CUS-1000')))

    await vi.waitFor(() => expect(detail.error.value).toBeTruthy(), { timeout: 5_000 })

    expect(detail.error.value).toMatchObject({ code: 'UNEXPECTED_RESPONSE', kind: 'contract' })
  })

  it('reports one in place of the record a write is read back from', async () => {
    server.use(
      http.patch('*/api/customers/:id', () => new HttpResponse(null, { status: 204 })),
      http.get('*/api/customers/:id', fallbackPage),
    )
    const update = withQueryClient(() => useUpdateCustomerMutation())

    await expect(update.mutateAsync({ id: 'CUS-1000', patch: draft })).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    })
  })

  // Express's `res.sendStatus(200)`, Django's `HttpResponse('ok')`: the delete
  // happened, and nobody reads the body. Reporting it as failed has the user
  // delete again, and get a 404 for a record that is already gone.
  it.each([
    ['200 "OK" as text/plain', () => HttpResponse.text('OK')],
    ['202 "Accepted" as text/plain', () => HttpResponse.text('Accepted', { status: 202 })],
    ['200 "ok" as text/html', () => HttpResponse.html('ok')],
    ['204 with no body', () => new HttpResponse(null, { status: 204 })],
  ])('resolves a delete answered with %s', async (_, answer) => {
    const deleted: string[] = []
    server.use(
      http.delete('*/api/customers/:id', ({ params }) => {
        deleted.push(String(params.id))
        return answer()
      }),
    )
    const remove = withQueryClient(() => useDeleteCustomerMutation())

    await expect(remove.mutateAsync('CUS-1000')).resolves.toBeUndefined()
    expect(deleted).toEqual(['CUS-1000'])
  })
})

describe('authorization', () => {
  it('rejects every endpoint without a bearer token', async () => {
    for (const [path, init] of [
      ['/customers', {}],
      ['/customers/CUS-1000', {}],
      ['/customers', { method: 'POST', body: '{}' }],
      ['/customers/CUS-1000', { method: 'PATCH', body: '{}' }],
      ['/customers/CUS-1000', { method: 'DELETE' }],
    ] as const) {
      const response = await fetch(`http://localhost/api${path}`, init)
      expect(response.status, `${init.method ?? 'GET'} ${path}`).toBe(401)
    }
  })
})

describe('reset', () => {
  it('restores the seed, so one test cannot leak into the next', async () => {
    const before = listSchema.parse((await request('/customers')).body).meta.total
    await request('/customers', { method: 'POST', body: JSON.stringify({ ...draftForReset }) })
    resetCustomersMock()
    const after = listSchema.parse((await request('/customers')).body).meta.total

    expect(after).toBe(before)
  })
})

const draftForReset = {
  company: 'Ephemeral Co',
  contactName: 'Yuki Tanaka',
  email: 'yuki@ephemeral.example',
  phone: '+1 555 1111',
  status: 'prospect' as const,
  plan: 'starter' as const,
  city: 'Osaka',
  country: 'JP',
  notes: '',
}
