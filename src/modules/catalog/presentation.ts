/**
 * Catalogue presentation rules.
 *
 * Stock is communicated by a worded badge, never by colour alone. The variant
 * lives here because the grid and the record page must agree: "not stocked" is
 * a property of the product, "out of stock" is a temporary condition to act on,
 * and the two must not collapse into one grey badge on one page and one red
 * badge on the other.
 */
import type { StockLevel } from './types'

export type StockVariant = 'success' | 'warning' | 'error' | 'default'

const STOCK_VARIANT: Record<StockLevel, StockVariant> = {
  ok: 'success',
  low: 'warning',
  out: 'error',
  'not-stocked': 'default',
}

export function stockVariant(level: StockLevel): StockVariant {
  return STOCK_VARIANT[level]
}
