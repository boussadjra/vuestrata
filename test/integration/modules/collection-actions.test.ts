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
import { z } from 'zod'

import { installApiAuth } from '@/lib/api/client'
import { createApiAction, createCollectionApi } from '@/lib/api/collection-queries'
import { dialects, extendDialect } from '@/lib/api/dialects'
import { resolveApiIntegration } from '@/lib/api/integration'
import { AppError } from '@/lib/errors'
import { defineQueryKeys } from '@/lib/query-keys'
import { __resetRuntimeSlots, installApiIntegration } from '@/lib/runtime'

import { withQueryClient } from '../../utils/query-client'
import { resetRuntimeState } from '../../utils/reset-runtime-state'

/**
 * Calls that are not one of the five: an action on a record, an action on the
 * collection, and a standalone one. Each keeps what the five have: the input
 * and the answer are validated, the keys follow the dialect, and the lists
 * are invalidated when the call settles.
 */

interface Order {
  id: string
  status: string
  cancelReason?: string
}

const orderSchema: z.ZodType<Order> = z.object({
  id: z.string(),
  status: z.string(),
  cancelReason: z.string().optional(),
})

const orderKeys = defineQueryKeys('orders')

const orders = createCollectionApi<Order>({
  resource: 'orders',
  schema: orderSchema,
  keys: orderKeys,
})

interface WireEntry {
  request: string
  body: unknown
  contentType: string | null
}

const server = setupServer()
const wire: WireEntry[] = []

function recordWire() {
  server.use(
    http.all('*/api/*', async ({ request }) => {
      const url = new URL(request.url)
      const text = await request.clone().text()
      wire.push({
        request: `${request.method} ${url.pathname}${url.search}`,
        body: text === '' ? null : JSON.parse(text),
        contentType: request.headers.get('content-type'),
      })
    }),
  )
}

/** A mutation composable mounted with a client whose invalidations are observed. */
function mounted<T>(useIt: () => T) {
  return withQueryClient((client) => ({
    action: useIt(),
    invalidateQueries: vi.spyOn(client, 'invalidateQueries'),
  }))
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

describe('an action on one record', () => {
  const useCancelOrder = orders.action({
    path: (id) => `${id}/cancel`,
    input: z.object({ reason: z.string().min(1) }),
    output: orderSchema,
  })

  it('posts under the record, validates the answer and invalidates the collection', async () => {
    server.use(
      http.post('*/api/orders/:id/cancel', () =>
        HttpResponse.json({ id: 'O-1', status: 'cancelled', cancelReason: 'duplicate', extra: 1 }),
      ),
    )
    recordWire()
    const { action, invalidateQueries } = mounted(useCancelOrder)

    const order = await action.mutateAsync({ id: 'O-1', input: { reason: 'duplicate' } })

    expect(wire).toEqual([
      {
        request: 'POST /api/orders/O-1/cancel',
        body: { reason: 'duplicate' },
        contentType: 'application/json',
      },
    ])
    // The record as the schema reads it.
    expect(order).toEqual({ id: 'O-1', status: 'cancelled', cancelReason: 'duplicate' })
    expect(invalidateQueries).toHaveBeenCalledTimes(1)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['orders'] })
  })

  it('refuses an input its schema refuses, before anything is sent', async () => {
    recordWire()
    const { action } = mounted(useCancelOrder)

    const error: unknown = await action.mutateAsync({ id: 'O-1', input: { reason: '' } }).then(
      () => undefined,
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({
      code: 'INVALID_INPUT',
      status: 422,
      retryable: false,
      messageKey: 'errors.status_422',
    })
    expect(Object.keys((error as AppError).details ?? {})).toEqual(['reason'])
    expect(wire).toEqual([])
  })

  it('fails an answer that is not the record as a contract mismatch', async () => {
    server.use(http.post('*/api/orders/:id/cancel', () => HttpResponse.json({ ok: true })))
    const { action, invalidateQueries } = mounted(useCancelOrder)

    const error: unknown = await action.mutateAsync({ id: 'O-1', input: { reason: 'x' } }).then(
      () => undefined,
      (reason: unknown) => reason,
    )

    expect(error).toMatchObject({ code: 'CONTRACT_MISMATCH', kind: 'contract' })
    expect(Object.keys((error as AppError).details ?? {})).toEqual(['id', 'status'])
    // The cancellation may well have happened: the lists are refreshed anyway.
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['orders'] })
  })

  it('passes a refusal from the backend on as it is, and still invalidates', async () => {
    server.use(
      http.post('*/api/orders/:id/cancel', () =>
        HttpResponse.json({ message: 'Already shipped', code: 'ORDER_SHIPPED' }, { status: 409 }),
      ),
    )
    const { action, invalidateQueries } = mounted(useCancelOrder)

    await expect(action.mutateAsync({ id: 'O-1', input: { reason: 'x' } })).rejects.toMatchObject({
      status: 409,
      code: 'ORDER_SHIPPED',
      kind: 'http',
    })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['orders'] })
  })
})

describe('an action on the collection', () => {
  it('sends its input and resolves with nothing when it declares no output', async () => {
    const useBulkArchive = orders.action({
      path: 'bulk-archive',
      input: z.object({ ids: z.array(z.string()).min(1) }),
    })
    server.use(http.post('*/api/orders/bulk-archive', () => new HttpResponse('OK')))
    recordWire()
    const { action } = mounted(useBulkArchive)

    await expect(action.mutateAsync({ input: { ids: ['O-1', 'O-2'] } })).resolves.toBeUndefined()

    expect(wire.map((entry) => [entry.request, entry.body])).toEqual([
      ['POST /api/orders/bulk-archive', { ids: ['O-1', 'O-2'] }],
    ])
  })

  it('sends no body without an input schema, with the method it names', async () => {
    const useReopen = orders.action({ method: 'PUT', path: (id) => `${id}/reopen` })
    server.use(http.put('*/api/orders/:id/reopen', () => new HttpResponse(null, { status: 204 })))
    recordWire()
    const { action } = mounted(useReopen)

    await action.mutateAsync({ id: 'O-1' })

    expect(wire).toEqual([{ request: 'PUT /api/orders/O-1/reopen', body: null, contentType: null }])
  })

  it('takes a path from the API root, and its own keys to invalidate', async () => {
    const useRefund = orders.action({
      path: (id) => `/payments/${id}/refund`,
      output: z.object({ refunded: z.boolean() }),
      invalidates: [orderKeys.all, ['payments']],
    })
    server.use(http.post('*/api/payments/:id/refund', () => HttpResponse.json({ refunded: true })))
    recordWire()
    const { action, invalidateQueries } = mounted(useRefund)

    await expect(action.mutateAsync({ id: 'PAY-9' })).resolves.toEqual({ refunded: true })

    expect(wire.map((entry) => entry.request)).toEqual(['POST /api/payments/PAY-9/refund'])
    expect(invalidateQueries.mock.calls).toEqual([
      [{ queryKey: ['orders'] }],
      [{ queryKey: ['payments'] }],
    ])
  })

  it('follows a nested collection under its parent', async () => {
    const lines = createCollectionApi<
      Order,
      Record<string, never>,
      Partial<Order>,
      Partial<Order>,
      { orderId: string }
    >({
      resource: 'lines',
      path: ({ orderId }) => `/orders/${orderId}/lines`,
      schema: orderSchema,
      keys: defineQueryKeys('lines'),
    })
    server.use(
      http.post('*/api/orders/:orderId/lines/:id/split', () =>
        HttpResponse.json({ id: 'L-2', status: 'open' }),
      ),
    )
    recordWire()
    const { action } = withQueryClient(() => ({
      action: lines.within({ orderId: 'O-1' }).action({
        path: (id) => `${id}/split`,
        output: orderSchema,
      })(),
    }))

    await action.mutateAsync({ id: 'L-1' })

    expect(wire.map((entry) => entry.request)).toEqual(['POST /api/orders/O-1/lines/L-1/split'])
  })
})

describe('an action under a dialect', () => {
  const laravelOrders = createCollectionApi<Order>({
    resource: 'orders',
    schema: orderSchema,
    keys: orderKeys,
    dialect: extendDialect(dialects.laravel, { keys: 'camel' }),
  })

  it('writes the input in the backend’s case, and reads the record out of its envelope', async () => {
    const useCancel = laravelOrders.action({
      path: (id) => `${id}/cancel`,
      input: z.object({ cancelReason: z.string(), notifyCustomer: z.boolean() }),
      output: orderSchema,
    })
    server.use(
      http.post('*/api/orders/:id/cancel', () =>
        HttpResponse.json({ data: { id: 'O-1', status: 'cancelled', cancel_reason: 'duplicate' } }),
      ),
    )
    recordWire()
    const { action } = mounted(useCancel)

    const order = await action.mutateAsync({
      id: 'O-1',
      input: { cancelReason: 'duplicate', notifyCustomer: true },
    })

    expect(wire[0]?.body).toEqual({ cancel_reason: 'duplicate', notify_customer: true })
    expect(order).toEqual({ id: 'O-1', status: 'cancelled', cancelReason: 'duplicate' })
  })

  it('takes the trailing slash the action wrote', async () => {
    const drfOrders = createCollectionApi<Order>({
      resource: 'orders',
      schema: orderSchema,
      keys: orderKeys,
      dialect: dialects.drf,
    })
    server.use(http.post('*/api/orders/:id/cancel/', () => new HttpResponse(null, { status: 204 })))
    recordWire()
    const { action } = mounted(drfOrders.action({ path: (id) => `${id}/cancel/` }))

    await action.mutateAsync({ id: 'O-1' })

    expect(wire.map((entry) => entry.request)).toEqual(['POST /api/orders/O-1/cancel/'])
  })
})

describe('a standalone action', () => {
  const invitationSchema = z.object({ id: z.string(), email: z.string() })

  it('calls a path from the API root, validated, and invalidates only what it names', async () => {
    const useInvite = createApiAction({
      path: '/invitations',
      input: z.object({ email: z.email() }),
      output: invitationSchema,
    })
    const useRevoke = createApiAction({
      method: 'DELETE',
      path: (id) => `/invitations/${id}`,
      invalidates: [['invitations']],
    })
    server.use(
      http.post('*/api/invitations', () =>
        HttpResponse.json({ id: 'I-1', email: 'ada@example.test' }, { status: 201 }),
      ),
      http.delete('*/api/invitations/:id', () => new HttpResponse(null, { status: 204 })),
    )
    recordWire()
    const { invite, revoke, invalidateQueries } = withQueryClient((client) => ({
      invite: useInvite(),
      revoke: useRevoke(),
      invalidateQueries: vi.spyOn(client, 'invalidateQueries'),
    }))

    const invitation = await invite.mutateAsync({ input: { email: 'ada@example.test' } })
    expect(invalidateQueries).not.toHaveBeenCalled()
    await revoke.mutateAsync({ id: 'I-1' })

    expect(invitation).toEqual({ id: 'I-1', email: 'ada@example.test' })
    expect(wire.map((entry) => [entry.request, entry.body])).toEqual([
      ['POST /api/invitations', { email: 'ada@example.test' }],
      ['DELETE /api/invitations/I-1', null],
    ])
    expect(invalidateQueries.mock.calls).toEqual([[{ queryKey: ['invitations'] }]])
  })

  it('speaks the project’s dialect', async () => {
    installApiIntegration(
      resolveApiIntegration({ collection: extendDialect(dialects.laravel, { keys: 'camel' }) }),
    )
    const useInvite = createApiAction({
      path: '/invitations',
      input: z.object({ emailAddress: z.string() }),
      output: z.object({ id: z.string(), invitedBy: z.string() }),
    })
    server.use(
      http.post('*/api/invitations', () =>
        HttpResponse.json({ data: { id: 'I-1', invited_by: 'U-1' } }, { status: 201 }),
      ),
    )
    recordWire()
    const { action } = mounted(useInvite)

    const invitation = await action.mutateAsync({ input: { emailAddress: 'ada@example.test' } })

    expect(wire[0]?.body).toEqual({ email_address: 'ada@example.test' })
    expect(invitation).toEqual({ id: 'I-1', invitedBy: 'U-1' })
  })
})
