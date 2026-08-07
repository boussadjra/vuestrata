/** Catalog server state — the shared collection contract with a product schema. */
import { createCollectionApi } from '~/lib/api/collection-queries'

import { catalogModuleKeys } from '../query-keys'
import { productSchema, type Product, type ProductDraft, type ProductFilters } from '../types'

const catalogApi = createCollectionApi<Product, ProductFilters, ProductDraft, ProductDraft>({
  resource: 'products',
  schema: productSchema,
  keys: catalogModuleKeys,
})

export const useProductsQuery = catalogApi.useList
export const useProductQuery = catalogApi.useDetail
export const useCreateProductMutation = catalogApi.useCreate
export const useUpdateProductMutation = catalogApi.useUpdate
export const useDeleteProductMutation = catalogApi.useRemove
