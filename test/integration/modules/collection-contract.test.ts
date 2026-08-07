import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test'
import { z } from 'zod'

import { createMockJwt } from '@/mocks/utils'
import { customersHandlers, resetCustomersMock } from '@/modules/customers/mocks/customers.handlers'
import { customerSchema } from '@/modules/customers/types'

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
