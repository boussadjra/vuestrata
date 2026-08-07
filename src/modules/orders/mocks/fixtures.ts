/**
 * Seeded orders.
 *
 * Totals come from `priceOrder`, the same function the mock's POST handler and
 * the new-order review step use, so every order in the demo adds up and an
 * order created during the demo is priced identically to the ones that shipped
 * with it. A dataset whose line items do not sum to its stated total is the
 * fastest way to teach a reader that none of the numbers mean anything.
 */

import { money } from '~/lib/money'
import {
  COMPANY_NAMES,
  CITIES,
  createRng,
  daysFromNow,
  pick,
  randomInt,
  sequentialId,
} from '~/mocks/seed'

import { ORDER_CATALOG, priceOrder } from '../pricing'
import { ORDER_CHANNELS, ORDER_STATUSES, type Order, type OrderLine } from '../types'

export function createOrderFixtures(count = 64): Order[] {
  const rng = createRng(19_991_231)

  return Array.from({ length: count }, (_, index) => {
    const lines: OrderLine[] = Array.from({ length: randomInt(rng, 1, 4) }, () => {
      const product = pick(rng, ORDER_CATALOG)
      return {
        sku: product.sku,
        name: product.name,
        quantity: randomInt(rng, 1, 12),
        unitPrice: money(product.unitPrice),
      }
    })

    const status = pick(rng, ORDER_STATUSES)
    const placedDaysAgo = randomInt(rng, 0, 120)
    const location = pick(rng, CITIES)

    return {
      id: sequentialId('ORD', index),
      reference: sequentialId('ORD', index),
      customerId: sequentialId('CUS', index % 48),
      customerName: COMPANY_NAMES[index % COMPANY_NAMES.length]!,
      status,
      channel: pick(rng, ORDER_CHANNELS),
      placedAt: daysFromNow(-placedDaysAgo, randomInt(rng, 8, 20)),
      // Only a fulfilled order carries a fulfilment date, and it must fall
      // after the order was placed — otherwise a "days to ship" column renders
      // a negative number.
      fulfilledAt:
        status === 'fulfilled'
          ? daysFromNow(-Math.max(0, placedDaysAgo - randomInt(rng, 1, 5)))
          : null,
      lines,
      ...priceOrder(lines),
      shippingCity: location.city,
      shippingCountry: location.country,
      notes: '',
    } satisfies Order
  })
}

export const orderFixtures = createOrderFixtures()
