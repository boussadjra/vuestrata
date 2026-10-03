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
import {
  createApiAction,
  createCollectionApi,
  type CollectionFilters,
} from '@/lib/api/collection-queries'
import { apiPath, dialects, pathSegment, resolveCollectionDialect } from '@/lib/api/dialects'
import { AppError } from '@/lib/errors'
import { defineQueryKeys } from '@/lib/query-keys'
import { __resetRuntimeSlots } from '@/lib/runtime'

import { withQueryClient } from '../../utils/query-client'
import { resetRuntimeState } from '../../utils/reset-runtime-state'

/**
 * An id is data, whatever it holds.
 *
 * Every path the collection layer builds from an id (a record, an action on
 * a record, a nested resource under its parent) is asserted here for ids that
 * are not well-behaved: the request goes to exactly one URL, on the API's own
 * origin and inside its prefix, with the id as a single encoded segment; or
 * nothing is sent at all and the call fails with a code.
 *
 * Before this was pinned, an id was interpolated as it came. `../admin`
 * reached another resource with the session's token, `x#f` turned "delete
 * this contact" into "delete its customer", and an id that was a whole URL
 * sent the request body to another host.
 */

interface Widget {
  id: string
  name: string
}

const widgetSchema = z.object({ id: z.string(), name: z.string() })
const bolt: Widget = { id: 'W-1', name: 'Bolt' }

const server = setupServer()
/** Every request that reached the network, wherever it went. */
const wire: string[] = []

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  wire.length = 0
  installApiAuth({
    getToken: () => 'session-token',
    getRefreshToken: () => null,
    setAuth: () => {},
    clearAuth: () => {},
  })
  // Any host, any path: a request that left the API is recorded, not lost.
  server.use(
    http.all('*', ({ request }) => {
      const url = new URL(request.url)
      wire.push(`${request.method} ${url.origin}${url.pathname}${url.search}${url.hash}`)
      if (request.method === 'DELETE') return new HttpResponse(null, { status: 204 })
      const isList = request.method === 'GET' && /\/(?:widgets|contacts)\/?$/.test(url.pathname)
      return HttpResponse.json(
        isList ? { data: [bolt], meta: { total: 1, page: 1, pageSize: 10, totalPages: 1 } } : bolt,
      )
    }),
  )
})
afterEach(async () => {
  server.resetHandlers()
  __resetRuntimeSlots()
  await resetRuntimeState()
})
afterAll(() => server.close())

/** The API base in a test run: the page's own origin, and the `/api` prefix. */
const API = `${window.location.origin}/api`

/** Ids that are sent, with the one segment each must arrive as. */
const encoded: [id: string, segment: string][] = [
  ['../x', '..%2Fx'],
  ['../../outside', '..%2F..%2Foutside'],
  ['a/b', 'a%2Fb'],
  ['x?y', 'x%3Fy'],
  ['x#f', 'x%23f'],
  ['//host', '%2F%2Fhost'],
  ['/admin/users', '%2Fadmin%2Fusers'],
  ['https://host/x', 'https%3A%2F%2Fhost%2Fx'],
  ['a\\b', 'a%5Cb'],
  ['%2e%2e', '%252e%252e'],
  [' ', '%20'],
  // A legitimate id: a space and letters outside ASCII.
  ['ordre 42 é', 'ordre%2042%20%C3%A9'],
  // And the ones that need nothing: sent exactly as they always were.
  ['W-1', 'W-1'],
  ['a.b_c~d', 'a.b_c~d'],
]

/** Ids no path can hold: nothing is sent. */
const refused: [label: string, id: string][] = [
  ['an empty id', ''],
  ['"."', '.'],
  ['".."', '..'],
]

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
}

function expectRefusal(error: unknown, code = 'INVALID_ID') {
  expect(error).toBeInstanceOf(AppError)
  expect(error).toMatchObject({ code, status: 400, retryable: false })
  expect(wire).toEqual([])
}

describe.each([
  ['the default dialect', undefined, ''],
  ['a dialect with its own record path (DRF)', dialects.drf, '/'],
])('a record of %s', (_, dialect, slash) => {
  const widgets = createCollectionApi<Widget>({
    resource: 'widgets',
    schema: widgetSchema,
    keys: defineQueryKeys('widgets'),
    ...(dialect ? { dialect } : {}),
  })

  it.each(encoded)('reads, updates and removes %j as one segment', async (id, segment) => {
    const api = withQueryClient(() => ({
      detail: widgets.useDetail(id),
      update: widgets.useUpdate(),
      remove: widgets.useRemove(),
    }))
    await vi.waitFor(() => expect(api.detail.isPending.value).toBe(false), { timeout: 5_000 })
    expect(api.detail.error.value).toBeNull()
    wire.length = 0

    await api.update.mutateAsync({ id, patch: { name: 'x' } })
    await api.remove.mutateAsync(id)

    const record = `${API}/widgets/${segment}${slash}`
    // The writes invalidate the detail, which may refetch: to the same URL.
    expect([...new Set(wire)]).toEqual(
      expect.arrayContaining([`PATCH ${record}`, `DELETE ${record}`]),
    )
    for (const request of wire) expect(request.endsWith(` ${record}`)).toBe(true)
  })

  it.each(refused)('refuses %s before anything is sent', async (_label, id) => {
    const api = withQueryClient(() => ({
      detail: widgets.useDetail(id),
      update: widgets.useUpdate(),
      remove: widgets.useRemove(),
    }))

    if (id === '') {
      // No id is "not known yet" to a detail: it waits, as it always has.
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(api.detail.isPending.value).toBe(true)
    } else {
      await vi.waitFor(() => expect(api.detail.error.value).toBeTruthy(), { timeout: 5_000 })
      expectRefusal(api.detail.error.value)
    }
    expectRefusal(await rejection(api.update.mutateAsync({ id, patch: { name: 'x' } })))
    expectRefusal(await rejection(api.remove.mutateAsync(id)))
  })

  it.each([
    ['a number that is not one', Number.NaN],
    ['an object', { toString: () => '../admin' }],
    ['a list', ['a', 'b']],
    ['nothing', null],
    ['a boolean', true],
  ])('refuses %s as an id', async (_label, id) => {
    const remove = withQueryClient(() => widgets.useRemove())

    expectRefusal(await rejection(remove.mutateAsync(id as unknown as string)))
  })

  it('takes a number as its text', async () => {
    const remove = withQueryClient(() => widgets.useRemove())

    await remove.mutateAsync(42 as unknown as string)

    expect(wire).toEqual([`DELETE ${API}/widgets/42${slash}`])
  })
})

describe('an action on one record', () => {
  const widgets = createCollectionApi<Widget>({
    resource: 'widgets',
    schema: widgetSchema,
    keys: defineQueryKeys('widgets'),
  })
  const useCancel = widgets.action({ path: (id) => `${id}/cancel` })

  it.each(encoded)('posts under %j as one segment of the collection', async (id, segment) => {
    const cancel = withQueryClient(() => useCancel())

    await cancel.mutateAsync({ id })

    expect(wire).toEqual([`POST ${API}/widgets/${segment}/cancel`])
  })

  it.each(refused)('refuses %s before anything is sent', async (_label, id) => {
    const cancel = withQueryClient(() => useCancel())

    expectRefusal(await rejection(cancel.mutateAsync({ id })))
  })

  it('refuses a call that names no record', async () => {
    const cancel = withQueryClient(() => useCancel())

    expectRefusal(await rejection(cancel.mutateAsync({} as { id: string })))
  })

  it('gets the trailing slash of a dialect that writes one, once', async () => {
    const drfWidgets = createCollectionApi<Widget>({
      resource: 'widgets',
      schema: widgetSchema,
      keys: defineQueryKeys('widgets'),
      dialect: dialects.drf,
    })
    const { cancel, exportIt, written, rooted } = withQueryClient(() => ({
      cancel: drfWidgets.action({ path: (id) => `${id}/cancel` })(),
      exportIt: drfWidgets.action({ path: (id) => `${id}/export?format=csv` })(),
      written: drfWidgets.action({ path: (id) => `${id}/archive/` })(),
      rooted: drfWidgets.action({ path: (id) => `/payments/${id}/refund` })(),
    }))

    await cancel.mutateAsync({ id: 'a/b' })
    await exportIt.mutateAsync({ id: '5' })
    await written.mutateAsync({ id: '5' })
    await rooted.mutateAsync({ id: '5' })

    expect(wire).toEqual([
      // Django's APPEND_SLASH cannot redirect a POST: the slash is written here.
      `POST ${API}/widgets/a%2Fb/cancel/`,
      `POST ${API}/widgets/5/export/?format=csv`,
      `POST ${API}/widgets/5/archive/`,
      // From the API root: as the action wrote it.
      `POST ${API}/payments/5/refund`,
    ])
  })
})

describe('a path a template wrote', () => {
  const widgets = createCollectionApi<Widget>({
    resource: 'widgets',
    schema: widgetSchema,
    keys: defineQueryKeys('widgets'),
  })

  it.each([
    ['climbs out of the collection', '../admin/secrets'],
    ['climbs out of the API prefix', '/../../outside'],
    ['hides the climb in percent-encoding', '/x/%2E%2e/admin'],
    ['names another host', '//evil.example/x'],
    ['uses a backslash for a slash', '/\\evil.example/x'],
    ['hides a slash behind a tab', '/\t/evil.example/x'],
    ['stays where it is', './cancel'],
  ])('is refused when it %s', async (_label, path) => {
    const action = withQueryClient(() => widgets.action({ path })())

    expectRefusal(await rejection(action.mutateAsync({})), 'INVALID_PATH')
  })

  it('keeps its own query string and a colon', async () => {
    const { exportIt, custom } = withQueryClient(() => ({
      exportIt: widgets.action({ path: (id) => `${id}/export?format=csv&as=${id}` })(),
      // Google's custom-method spelling: a colon is not a scheme here.
      custom: widgets.action({ path: (id) => `${id}:cancel` })(),
    }))

    await exportIt.mutateAsync({ id: 'a&b=c' })
    await custom.mutateAsync({ id: 'W-1' })

    expect(wire).toEqual([
      `POST ${API}/widgets/a%26b%3Dc/export?format=csv&as=a%26b%3Dc`,
      `POST ${API}/widgets/W-1:cancel`,
    ])
  })
})

describe('a standalone action', () => {
  const roleSchema = z.object({ role: z.string() })
  // The shape of the template's own role update.
  const useUpdateRole = createApiAction({
    method: 'PATCH',
    path: (id) => `/users/${id}/role`,
    input: roleSchema,
  })

  it.each(encoded)('sends %j as one segment of its path', async (id, segment) => {
    const update = withQueryClient(() => useUpdateRole())

    await update.mutateAsync({ id, input: { role: 'admin' } })

    expect(wire).toEqual([`PATCH ${API}/users/${segment}/role`])
  })

  it.each(refused)('refuses %s before anything is sent', async (_label, id) => {
    const update = withQueryClient(() => useUpdateRole())

    expectRefusal(await rejection(update.mutateAsync({ id, input: { role: 'admin' } })))
  })

  it.each([
    ['an id', 'W-1'],
    ['a whole URL', 'https://evil.example/x'],
    ['another host', '//evil.example/x'],
  ])('refuses a template that starts with the id, given %s', async (_label, id) => {
    // Nothing it could continue: the id, or whatever was passed as one, would
    // be the start of the URL.
    const action = withQueryClient(() =>
      createApiAction({ path: (given) => `${given}/x`, input: roleSchema })(),
    )

    expectRefusal(
      await rejection(action.mutateAsync({ id, input: { role: 'admin' } })),
      'INVALID_PATH',
    )
  })

  it('refuses a path that is a URL', async () => {
    const action = withQueryClient(() =>
      createApiAction({ path: 'https://evil.example/collect', input: roleSchema })(),
    )

    expectRefusal(await rejection(action.mutateAsync({ input: { role: 'admin' } })), 'INVALID_PATH')
  })
})

describe('a nested resource', () => {
  type Parent = { customerId: string }

  const contacts = createCollectionApi<
    Widget,
    CollectionFilters,
    Omit<Widget, 'id'>,
    Partial<Widget>,
    Parent
  >({
    resource: 'contacts',
    path: ({ customerId }) => `/customers/${customerId}/contacts`,
    schema: widgetSchema,
    keys: defineQueryKeys('contacts'),
  })

  function mount(parent: Parent) {
    return withQueryClient(() => {
      const scoped = contacts.within(parent)
      return {
        list: scoped.useList(ref({})),
        detail: scoped.useDetail('K-1'),
        create: scoped.useCreate(),
        update: scoped.useUpdate(),
        remove: scoped.useRemove(),
        split: scoped.action({ path: (id) => `${id}/split` })(),
      }
    })
  }

  it.each(encoded)(
    'lists, reads and writes under the parent %j as one segment',
    async (customerId, segment) => {
      const api = mount({ customerId })
      await vi.waitFor(
        () => {
          expect(api.list.isPending.value).toBe(false)
          expect(api.detail.isPending.value).toBe(false)
        },
        { timeout: 5_000 },
      )
      expect(api.list.error.value).toBeNull()
      expect(api.detail.error.value).toBeNull()

      await api.create.mutateAsync({ name: 'Grace' })
      await api.update.mutateAsync({ id: 'K-1', patch: { name: 'Grace H.' } })
      await api.split.mutateAsync({ id: 'K-1' })
      await api.remove.mutateAsync('K-1')

      const base = `${API}/customers/${segment}/contacts`
      expect([...new Set(wire)].toSorted()).toEqual(
        [
          `GET ${base}`,
          `GET ${base}/K-1`,
          `POST ${base}`,
          `PATCH ${base}/K-1`,
          `POST ${base}/K-1/split`,
          // The contact, never its customer.
          `DELETE ${base}/K-1`,
        ].toSorted(),
      )
    },
  )

  it.each([
    ['"."', '.'],
    ['".."', '..'],
  ])('refuses the parent %s before anything is sent', async (_label, customerId) => {
    const api = mount({ customerId })

    await vi.waitFor(
      () => {
        expect(api.list.error.value).toBeTruthy()
        expect(api.detail.error.value).toBeTruthy()
      },
      { timeout: 5_000 },
    )

    expectRefusal(api.list.error.value)
    expectRefusal(api.detail.error.value)
    expectRefusal(await rejection(api.create.mutateAsync({ name: 'x' })))
    expectRefusal(await rejection(api.update.mutateAsync({ id: 'K-1', patch: { name: 'x' } })))
    expectRefusal(await rejection(api.remove.mutateAsync('K-1')))
    expectRefusal(await rejection(api.split.mutateAsync({ id: 'K-1' })))
  })

  it('refuses a parent id that is not text or a number', async () => {
    const api = mount({ customerId: { toString: () => '../admin' } as unknown as string })

    await vi.waitFor(() => expect(api.list.error.value).toBeTruthy(), { timeout: 5_000 })

    expectRefusal(api.list.error.value)
    expectRefusal(await rejection(api.remove.mutateAsync('K-1')))
  })

  it('waits for a parent that is empty, and sends nothing meanwhile', async () => {
    const api = mount({ customerId: '' })

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(api.list.isPending.value).toBe(true)
    await expect(api.remove.mutateAsync('K-1')).rejects.toThrow(/before its parent was known/)
    expect(wire).toEqual([])
  })

  it('takes a parent called "all": that is a filter’s word, not an id’s', async () => {
    const api = mount({ customerId: 'all' })

    await vi.waitFor(() => expect(api.list.isPending.value).toBe(false), { timeout: 5_000 })

    expect(wire).toContain(`GET ${API}/customers/all/contacts`)
  })

  it('refuses a hostile record id under a good parent', async () => {
    const api = mount({ customerId: 'C-1' })
    await vi.waitFor(() => expect(api.list.isPending.value).toBe(false), { timeout: 5_000 })
    await vi.waitFor(() => expect(api.detail.isPending.value).toBe(false), { timeout: 5_000 })
    wire.length = 0

    await api.remove.mutateAsync('x#f')

    expect(wire.filter((request) => request.startsWith('DELETE'))).toEqual([
      `DELETE ${API}/customers/C-1/contacts/x%23f`,
    ])
  })
})

describe('pathSegment and apiPath', () => {
  it('encodes what a path would read as structure, and nothing else', () => {
    expect(pathSegment('ORD-1042')).toBe('ORD-1042')
    expect(pathSegment(7)).toBe('7')
    expect(pathSegment('a/b?c#d')).toBe('a%2Fb%3Fc%23d')
    expect(pathSegment('user@example.test')).toBe('user%40example.test')
  })

  it('names what it refused, never the value', () => {
    const error = (() => {
      try {
        return pathSegment('..', 'parent id "customerId"')
      } catch (thrown) {
        return thrown
      }
    })()

    expect(error).toMatchObject({ code: 'INVALID_ID' })
    expect((error as Error).message).toBe(
      'The parent id "customerId" is not usable: it is a directory name, not a record.',
    )
    expect(() => pathSegment('\uD800')).toThrow(/not valid text/)
  })

  it('encodes the id for every dialect, the shipped ones and a project’s own', () => {
    const own = resolveCollectionDialect({
      name: 'own',
      parseList: () => null,
      paths: { detail: (base, id) => `${base}/by-id/${id}` },
    })

    for (const dialect of Object.values(dialects)) {
      const record = resolveCollectionDialect(dialect).paths.detail('/orders', '../x')
      expect(record.replace(/\/$/, '')).toBe('/orders/..%2Fx')
    }
    expect(own.paths.detail('/orders', 'a/b')).toBe('/orders/by-id/a%2Fb')
    expect(() => own.paths.detail('/orders', '..')).toThrow(AppError)
  })

  it('lets a path on the API through as it is', () => {
    expect(apiPath('/orders/7/cancel?notify=1#x')).toBe('/orders/7/cancel?notify=1#x')
    expect(apiPath('7:cancel')).toBe('7:cancel')
    // Dots that are part of a name are not a climb.
    expect(apiPath('/files/a..b/.well-known.json')).toBe('/files/a..b/.well-known.json')
    // Nor is anything after the path.
    expect(apiPath('/search?next=../x')).toBe('/search?next=../x')
  })
})
