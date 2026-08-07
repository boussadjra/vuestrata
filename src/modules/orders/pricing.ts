/**
 * Order pricing.
 *
 * Real domain logic, deliberately NOT in `mocks/`. The new-order page needs it
 * to show an accurate review step, and the mock backend needs it to price what
 * the page submits. Anything a page imports is in the production bundle — a
 * helper living under `mocks/` and imported from a page would drag the whole
 * fixture set, and eventually msw, into a build that must not contain them.
 *
 * The figures the *server* stores are always recomputed from the lines. This
 * module existing on the client is a convenience for the preview, never the
 * authority: a client-supplied total is a price the customer chose.
 */
import { money, type Money } from '~/lib/money'

import type { OrderLine } from './types'

/**
 * The orderable price list.
 *
 * Static here so the template runs with no backend. In a real deployment this
 * comes from your catalog service, and this constant is the first thing to
 * delete.
 */
export const ORDER_CATALOG = [
  { sku: 'HW-CTRL-01', name: 'Edge Controller', unitPrice: 129_00 },
  { sku: 'HW-SENS-04', name: 'Vibration Sensor', unitPrice: 39_00 },
  { sku: 'HW-GATE-02', name: 'Gateway Hub', unitPrice: 449_00 },
  { sku: 'SW-SEAT-01', name: 'Platform Seat (annual)', unitPrice: 240_00 },
  { sku: 'SW-API-01', name: 'API Tier — 1M calls', unitPrice: 95_00 },
  { sku: 'SV-INST-01', name: 'On-site Installation', unitPrice: 850_00 },
  { sku: 'SV-SUPP-02', name: 'Priority Support (year)', unitPrice: 1_200_00 },
  { sku: 'AC-CABL-03', name: 'Industrial Cable, 10m', unitPrice: 24_00 },
] as const

const TAX_RATE = 0.2
const SHIPPING_FLAT = 1_500

export interface OrderPricing {
  subtotal: Money
  shipping: Money
  tax: Money
  total: Money
}

/** Sum of `quantity × unitPrice` across lines, in minor units. */
export function subtotalOf(lines: readonly OrderLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPrice.amount, 0)
}

/** Whether an order contains anything that physically ships. */
function isShippable(lines: readonly OrderLine[]): boolean {
  return lines.some((line) => line.sku.startsWith('HW-') || line.sku.startsWith('AC-'))
}

/**
 * Derive every money figure from the lines.
 *
 * Integer arithmetic throughout, with a single `Math.round` on the tax. Working
 * in floats and rounding at the end leaves totals a cent out on roughly one
 * order in three, which is invisible in a demo and a reconciliation failure in
 * production.
 */
export function priceOrder(lines: readonly OrderLine[]): OrderPricing {
  const subtotal = subtotalOf(lines)
  // A software-only order ships nothing, so charging postage on it is the kind
  // of detail that tells a reader the numbers were not thought about.
  const shipping = isShippable(lines) ? SHIPPING_FLAT : 0
  const tax = Math.round((subtotal + shipping) * TAX_RATE)

  return {
    subtotal: money(subtotal),
    shipping: money(shipping),
    tax: money(tax),
    total: money(subtotal + shipping + tax),
  }
}
