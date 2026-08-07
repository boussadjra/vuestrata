import { z } from 'zod'

import type { CollectionFilters } from '~/lib/api/collection-queries'
import { moneySchema } from '~/lib/money'

/**
 * Order contract.
 *
 * Line items carry unit price and quantity separately rather than a single
 * total: a stored total cannot be re-checked, and the first time a quantity is
 * edited the two disagree with no way to tell which is right.
 */

export const ORDER_STATUSES = [
  'draft',
  'pending',
  'paid',
  'fulfilled',
  'cancelled',
  'refunded',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ORDER_CHANNELS = ['web', 'partner', 'sales', 'marketplace'] as const
export type OrderChannel = (typeof ORDER_CHANNELS)[number]

export const orderLineSchema = z.object({
  sku: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: moneySchema,
})
export type OrderLine = z.infer<typeof orderLineSchema>

export const orderSchema = z.object({
  id: z.string(),
  /** Human-facing reference, e.g. `ORD-1042`. Distinct from `id` on purpose. */
  reference: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  status: z.enum(ORDER_STATUSES),
  channel: z.enum(ORDER_CHANNELS),
  placedAt: z.string(),
  /** Absent until the order ships. */
  fulfilledAt: z.string().nullable(),
  lines: z.array(orderLineSchema),
  subtotal: moneySchema,
  shipping: moneySchema,
  tax: moneySchema,
  total: moneySchema,
  shippingCity: z.string(),
  shippingCountry: z.string(),
  notes: z.string(),
})

export type Order = z.infer<typeof orderSchema>

export interface OrderFilters extends CollectionFilters {
  status?: OrderStatus | 'all'
  channel?: OrderChannel | 'all'
}

/**
 * What the multi-step create form submits.
 *
 * Every money figure is derived server-side from the lines. Accepting a
 * client-supplied total would let a crafted request set its own price — the
 * canonical example of trusting input that only ever looked trustworthy because
 * the UI computed it.
 */
export const orderDraftSchema = z.object({
  customerId: z.string().min(1),
  customerName: z.string().min(1),
  channel: z.enum(ORDER_CHANNELS),
  shippingCity: z.string().min(1),
  shippingCountry: z.string().min(1),
  lines: z.array(orderLineSchema).min(1),
  notes: z.string(),
})

export type OrderDraft = z.infer<typeof orderDraftSchema>
