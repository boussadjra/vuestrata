/** Catalog mock backend — demo builds only. */
import { money } from '~/lib/money'
import { createCollectionMock } from '~/mocks/collection'

import { productDraftSchema, type Product } from '../types'
import { productFixtures } from './fixtures'

const catalogMock = createCollectionMock<Product>({
  resource: 'products',
  seed: productFixtures,
  searchFields: ['name', 'sku', 'description'],
  filterFields: ['category', 'status'],
  defaultSort: { by: 'name', order: 'asc' },

  create: (body) => {
    const parsed = productDraftSchema.safeParse(body)
    if (!parsed.success) return null

    return {
      ...parsed.data,
      id: parsed.data.sku,
      price: money(0),
      // A newly created product is not stocked until receiving books it in.
      // Defaulting to `0` would flag it as out of stock, which is a different
      // claim and produces a false reorder alert on day one.
      stock: null,
      reorderAt: 0,
      updatedAt: new Date().toISOString(),
    }
  },

  update: (record, body) => {
    const parsed = productDraftSchema.partial().safeParse(body)
    if (!parsed.success) return null
    return { ...record, ...parsed.data, updatedAt: new Date().toISOString() }
  },
})

export const catalogHandlers = catalogMock.handlers
export const resetCatalogMock = catalogMock.reset
