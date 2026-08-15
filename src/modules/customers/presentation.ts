/**
 * Customer presentation rules.
 *
 * The status→badge mapping is a property of the domain, not of a particular
 * route: the list and the record page must agree about what "churned" looks
 * like, and they used to agree only by having the same literal typed twice.
 *
 * The badge colour reinforces the label; it never carries the meaning alone
 * (WCAG 1.4.1) — every consumer renders the translated status text as well.
 */
import type { CustomerStatus } from './types'

export type CustomerStatusVariant = 'success' | 'warning' | 'error' | 'default'

const STATUS_VARIANT: Record<CustomerStatus, CustomerStatusVariant> = {
  active: 'success',
  trial: 'warning',
  prospect: 'default',
  churned: 'error',
}

export function customerStatusVariant(status: CustomerStatus): CustomerStatusVariant {
  return STATUS_VARIANT[status]
}
