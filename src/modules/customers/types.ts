import { z } from 'zod'

import type { CollectionFilters } from '~/lib/api/collection-queries'
import { moneySchema } from '~/lib/money'

/**
 * Customer contract.
 *
 * The same schema is used by the mock handler to build responses and by the
 * query composable to validate them, so the two cannot drift. Point the app at
 * a real backend and this file becomes the contract you agree with it.
 */

export const CUSTOMER_STATUSES = ['prospect', 'trial', 'active', 'churned'] as const
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number]

export const CUSTOMER_PLANS = ['starter', 'growth', 'scale', 'enterprise'] as const
export type CustomerPlan = (typeof CUSTOMER_PLANS)[number]

export const customerSchema = z.object({
  id: z.string(),
  company: z.string(),
  /** Primary contact. */
  contactName: z.string(),
  email: z.string(),
  phone: z.string(),
  status: z.enum(CUSTOMER_STATUSES),
  plan: z.enum(CUSTOMER_PLANS),
  city: z.string(),
  country: z.string(),
  /** Account manager's name — a display string, not a user reference. */
  owner: z.string(),
  mrr: moneySchema,
  lifetimeValue: moneySchema,
  openOrders: z.number().int().nonnegative(),
  /** ISO timestamp of the first contract. */
  since: z.string(),
  lastContactAt: z.string(),
  /** Free-text account notes. Empty is normal, not an error. */
  notes: z.string(),
})

export type Customer = z.infer<typeof customerSchema>

export interface CustomerFilters extends CollectionFilters {
  status?: CustomerStatus | 'all'
  plan?: CustomerPlan | 'all'
}

/** Fields a form may submit. Server-owned fields are deliberately absent. */
export const customerDraftSchema = customerSchema.pick({
  company: true,
  contactName: true,
  email: true,
  phone: true,
  status: true,
  plan: true,
  city: true,
  country: true,
  notes: true,
})

export type CustomerDraft = z.infer<typeof customerDraftSchema>
