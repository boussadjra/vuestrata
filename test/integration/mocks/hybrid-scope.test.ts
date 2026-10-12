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

/**
 * A mocked endpoint beside a real backend (`VUESTRATA_MOCK_ONLY`).
 *
 * Two things differ from the demo, and both are decided in `mocks/utils.ts`,
 * which every handler goes through:
 *
 *   - the request is signed by the REAL backend (or by nothing, under cookie
 *     transport), so a mocked endpoint cannot ask for the mock adapter's token;
 *   - the API may live on another origin, at a path the backend chose. Many
 *     serve from the root, and a pattern that covers "any origin" would then
 *     claim the app's own pages and source files.
 *
 * The demo's side of both is pinned in demo-default-behaviour.test.ts and
 * api-scope.test.ts.
 */

const env = vi.hoisted(() => ({ overrides: {} as Record<string, unknown> }))

vi.mock('~/lib/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/config')>()
  return {
    ...actual,
    // Read through on every access: the factory runs once, and each test below
    // evaluates the mock helpers again for an environment of its own.
    runtimeEnv: new Proxy(actual.runtimeEnv, {
      get: (target, key) =>
        key in env.overrides ? env.overrides[key as string] : Reflect.get(target, key),
    }),
  }
})

const HYBRID = { runtimeMode: 'demo', useMocks: true, authAdapter: 'jwt', mockOnly: ['orders'] }

/** `mocks/utils.ts` and `mocks/collection.ts`, evaluated for this environment. */
async function load(overrides: Record<string, unknown>) {
  env.overrides = overrides
  vi.resetModules()
  const utils = await import('@/mocks/utils')
  const { createCollectionMock } = await import('@/mocks/collection')
  return { ...utils, createCollectionMock }
}

/** Last resort: anything the mock backend did not claim lands here. */
const NOT_CLAIMED = 418
const fallback = http.all(/.*/, () => HttpResponse.text('not claimed', { status: NOT_CLAIMED }))

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  env.overrides = {}
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/** A token a real backend issued: nothing in it is the mock adapter's. */
const REAL_TOKEN = [
  btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
  btoa(JSON.stringify({ iss: 'https://id.acme.test', sub: '42' })),
  'signature',
].join('.')

describe('what a mocked endpoint accepts beside a real backend', () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request('http://localhost/api/orders', { headers })

  it('accepts the backend’s bearer token, which it cannot verify', async () => {
    const { isValidToken } = await load({ ...HYBRID, apiUrl: '/api' })

    expect(isValidToken(request({ Authorization: `Bearer ${REAL_TOKEN}` }))).toBe(true)
    expect(isValidToken(request({ Authorization: 'Bearer opaque-session-token' }))).toBe(true)
  })

  it('accepts a request with no Authorization header: cookie transport sends none', async () => {
    const { isValidToken } = await load({ ...HYBRID, authAdapter: 'oauth', apiUrl: '/api' })

    expect(isValidToken(request())).toBe(true)
  })

  it('serves a mocked collection to a request the demo would have answered 401', async () => {
    const { createCollectionMock } = await load({ ...HYBRID, apiUrl: '/api' })
    const orders = createCollectionMock<{ id: string; name: string }>({
      resource: 'orders',
      seed: [{ id: 'o-1', name: 'First' }],
      searchFields: ['name'],
      create: (body) => ({ id: 'o-2', name: String(body.name) }),
      update: (record, body) => ({ ...record, ...body }),
      latency: 0,
    })
    server.use(...orders.handlers, fallback)

    const headers = { Authorization: `Bearer ${REAL_TOKEN}`, 'Content-Type': 'application/json' }

    const list = await fetch('http://localhost/api/orders', { headers })
    expect(list.status).toBe(200)
    await expect(list.json()).resolves.toMatchObject({ data: [{ id: 'o-1' }], meta: { total: 1 } })

    // Plain CRUD needs no demo user and no demo session.
    const created = await fetch('http://localhost/api/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Second' }),
    })
    expect(created.status).toBe(201)

    const patched = await fetch('http://localhost/api/orders/o-1', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: 'Renamed' }),
    })
    await expect(patched.json()).resolves.toMatchObject({ id: 'o-1', name: 'Renamed' })

    expect((await fetch('http://localhost/api/orders/o-2', { method: 'DELETE' })).status).toBe(204)
    expect((await fetch('http://localhost/api/orders')).status).toBe(200)
  })

  it('still asks for the mock adapter’s token in an ordinary demo', async () => {
    const { isValidToken } = await load({ runtimeMode: 'demo', mockOnly: [], apiUrl: '/api' })

    expect(isValidToken(request({ Authorization: `Bearer ${REAL_TOKEN}` }))).toBe(false)
    expect(isValidToken(request())).toBe(false)
  })

  it('does not accept everything because a list was set in production mode', async () => {
    // Not reachable in a build: the schema clears it, and MSW is not bundled.
    const { isValidToken } = await load({
      runtimeMode: 'production',
      mockOnly: ['orders'],
      apiUrl: '/api',
    })

    expect(isValidToken(request())).toBe(false)
  })
})

describe('where a mocked endpoint is anchored beside a real backend', () => {
  it('keeps the base path of a same-origin API, on any origin: the dev proxy’s /api', async () => {
    const { mockApiUrl } = await load({ ...HYBRID, apiUrl: '/api' })

    expect(mockApiUrl('/orders/:id')).toBe('*/api/orders/:id')
  })

  it.each([
    ['http://localhost:8000/api', 'http://localhost:8000/api/orders/:id'],
    ['https://staging.acme.test/v1/', 'https://staging.acme.test/v1/orders/:id'],
    // A backend served from its root: no base path to tell an endpoint by.
    ['http://localhost:8000', 'http://localhost:8000/orders/:id'],
    ['http://localhost:8000/', 'http://localhost:8000/orders/:id'],
  ])('names the origin of the cross-origin API %s', async (apiUrl, pattern) => {
    const { mockApiUrl } = await load({ ...HYBRID, apiUrl })

    expect(mockApiUrl('/orders/:id')).toBe(pattern)
  })

  it('leaves an ordinary demo on "any origin", whatever its API URL', async () => {
    const { mockApiUrl } = await load({
      runtimeMode: 'demo',
      mockOnly: [],
      apiUrl: 'https://api.example.com/v1',
    })

    expect(mockApiUrl('/orders/:id')).toBe('*/v1/orders/:id')
  })

  describe('with a backend served from the root of another origin', () => {
    const APP = 'http://localhost:3452'
    const API = 'http://localhost:8000'

    async function mockOrders() {
      const { createCollectionMock } = await load({ ...HYBRID, apiUrl: API })
      const orders = createCollectionMock<{ id: string }>({
        resource: 'orders',
        seed: [{ id: 'o-1' }],
        searchFields: [],
        latency: 0,
      })
      server.use(...orders.handlers, fallback)
    }

    it('answers the endpoint on the backend’s origin', async () => {
      await mockOrders()

      expect((await fetch(`${API}/orders`)).status).toBe(200)
      expect((await fetch(`${API}/orders/o-1`)).status).toBe(200)
    })

    it.each([
      ['a source module Vite serves in dev', `${APP}/src/modules/orders/index.ts`],
      ['a hard reload of a detail route', `${APP}/dashboard/orders/o-1`],
      ['the list route', `${APP}/dashboard/orders`],
      ['a page of the app itself, at the same path', `${APP}/orders`],
      ['the same path on a third origin', 'https://cdn.acme.test/orders'],
    ])('does not claim %s', async (_label, url) => {
      await mockOrders()

      expect((await fetch(url)).status).toBe(NOT_CLAIMED)
    })
  })

  it('claims nothing outside the base path of a same-origin API', async () => {
    const { createCollectionMock } = await load({ ...HYBRID, apiUrl: '/api' })
    const orders = createCollectionMock<{ id: string }>({
      resource: 'orders',
      seed: [{ id: 'o-1' }],
      searchFields: [],
      latency: 0,
    })
    server.use(...orders.handlers, fallback)

    expect((await fetch('http://localhost/api/orders')).status).toBe(200)
    expect((await fetch('http://localhost/src/modules/orders/index.ts')).status).toBe(NOT_CLAIMED)
    expect((await fetch('http://localhost/dashboard/orders/o-1')).status).toBe(NOT_CLAIMED)
  })
})
