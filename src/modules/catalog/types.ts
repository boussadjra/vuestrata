import { z } from 'zod'

import type { CollectionFilters } from '~/lib/api/collection-queries'
import { moneySchema } from '~/lib/money'

/** Product catalogue contract. */

export const PRODUCT_CATEGORIES = ['hardware', 'software', 'services', 'accessories'] as const
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export const PRODUCT_STATUSES = ['active', 'draft', 'discontinued'] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

export const productSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(PRODUCT_CATEGORIES),
  status: z.enum(PRODUCT_STATUSES),
  price: moneySchema,
  /**
   * `null` for anything that is not physically stocked. Distinct from `0`,
   * which means "stocked and out of stock" — the two demand opposite actions.
   */
  stock: z.number().int().nonnegative().nullable(),
  /** Threshold below which stock is flagged. Ignored when `stock` is null. */
  reorderAt: z.number().int().nonnegative(),
  updatedAt: z.string(),
})

export type Product = z.infer<typeof productSchema>

export interface ProductFilters extends CollectionFilters {
  category?: ProductCategory | 'all'
  status?: ProductStatus | 'all'
}

export const productDraftSchema = productSchema.pick({
  sku: true,
  name: true,
  description: true,
  category: true,
  status: true,
})

export type ProductDraft = z.infer<typeof productDraftSchema>

/**
 * Stock state, derived rather than stored.
 *
 * A stored flag drifts the moment stock changes without the flag being
 * recomputed, and the UI then shows "in stock" over a quantity of zero.
 */
export type StockLevel = 'not-stocked' | 'out' | 'low' | 'ok'

export function stockLevelOf(product: Product): StockLevel {
  if (product.stock === null) return 'not-stocked'
  if (product.stock === 0) return 'out'
  return product.stock <= product.reorderAt ? 'low' : 'ok'
}
