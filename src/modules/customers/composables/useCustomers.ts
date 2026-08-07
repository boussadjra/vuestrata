/**
 * Customers server state.
 *
 * The whole module is `createCollectionApi` plus a schema — pagination, search,
 * sorting, cache invalidation and response validation are the shared collection
 * contract, not something this domain gets to reinvent.
 */
import { createCollectionApi } from '~/lib/api/collection-queries'

import { customersModuleKeys } from '../query-keys'
import { customerSchema, type Customer, type CustomerDraft, type CustomerFilters } from '../types'

const customersApi = createCollectionApi<Customer, CustomerFilters, CustomerDraft, CustomerDraft>({
  resource: 'customers',
  schema: customerSchema,
  keys: customersModuleKeys,
})

export const useCustomersQuery = customersApi.useList
export const useCustomerQuery = customersApi.useDetail
export const useCreateCustomerMutation = customersApi.useCreate
export const useUpdateCustomerMutation = customersApi.useUpdate
export const useDeleteCustomerMutation = customersApi.useRemove
