/**
 * Orders server state — the shared collection contract with an order schema.
 */
import { createCollectionApi } from '~/lib/api/collection-queries'

import { ordersModuleKeys } from '../query-keys'
import { orderSchema, type Order, type OrderDraft, type OrderFilters } from '../types'

const ordersApi = createCollectionApi<Order, OrderFilters, OrderDraft, Partial<Order>>({
  resource: 'orders',
  schema: orderSchema,
  keys: ordersModuleKeys,
})

export const useOrdersQuery = ordersApi.useList
export const useOrderQuery = ordersApi.useDetail
export const useCreateOrderMutation = ordersApi.useCreate
export const useUpdateOrderMutation = ordersApi.useUpdate
