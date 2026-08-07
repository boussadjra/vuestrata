/** Orders mock backend — demo builds only. */
import { z } from 'zod'

import { createCollectionMock } from '~/mocks/collection'

import { priceOrder } from '../pricing'
import { ORDER_STATUSES, orderDraftSchema, type Order } from '../types'
import { orderFixtures } from './fixtures'

const orderStatusEnum = z.enum(ORDER_STATUSES)

const ordersMock = createCollectionMock<Order>({
  resource: 'orders',
  seed: orderFixtures,
  searchFields: ['reference', 'customerName', 'shippingCity'],
  filterFields: ['status', 'channel', 'customerId'],
  defaultSort: { by: 'placedAt', order: 'desc' },

  create: (body, existing) => {
    const parsed = orderDraftSchema.safeParse(body)
    if (!parsed.success) return null

    // Priced server-side from the submitted lines, using the same function the
    // fixtures used. The client never sends a total: a request that could set
    // its own price is a request that will.
    const reference = `ORD-${1000 + existing.length}`
    return {
      id: reference,
      reference,
      status: 'pending',
      placedAt: new Date().toISOString(),
      fulfilledAt: null,
      ...parsed.data,
      ...priceOrder(parsed.data.lines),
    }
  },

  update: (record, body) => {
    // Only the fields an operator may change. Re-pricing on update would let a
    // PATCH rewrite a paid order's total.
    const patch = orderDraftSchema
      .pick({ notes: true, shippingCity: true, shippingCountry: true })
      .partial()
      .extend({ status: orderStatusEnum.optional() })
      .safeParse(body)
    if (!patch.success) return null

    const next = { ...record, ...patch.data }
    // A fulfilment date appears when the order is fulfilled and disappears if
    // it is moved back — otherwise a cancelled order keeps claiming it shipped.
    next.fulfilledAt =
      next.status === 'fulfilled' ? (record.fulfilledAt ?? new Date().toISOString()) : null
    return next
  },
})

export const ordersHandlers = ordersMock.handlers
export const resetOrdersMock = ordersMock.reset
