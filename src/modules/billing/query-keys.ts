import { defineQueryKeys } from '~/lib/query-keys'

/**
 * Billing module query keys.
 * Server state only — subscription data, invoices, payment methods.
 * Local billing preferences (e.g., selected interval) belong in a Pinia store.
 */
export const billingModuleKeys = {
  ...defineQueryKeys('billing'),
  data: () => ['billing', 'data'] as const,
}
