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

/**
 * Fields a form may submit. Server-owned fields are deliberately absent.
 *
 * This is where the rules live, not `customerSchema`: that one describes what
 * the server sends, and a record written before a rule existed must still
 * load. A draft is what a person is typing now, so it is held to today's
 * rules, by the form before it is sent and by the backend when it arrives.
 *
 * No messages here. The validation catalog words every one of these checks in
 * the reader's language (`core/lib/validation/zod-error-map.ts`); give a check
 * a message of its own only when the generic one would not say enough.
 */
export const customerDraftSchema = customerSchema.pick({ status: true, plan: true }).extend({
  company: z.string().trim().min(1).max(120),
  contactName: z.string().trim().min(1).max(120),
  // Trimmed and non-empty first, so an empty box reads "required" rather than
  // "not a valid email address".
  email: z.string().trim().min(1).max(254).pipe(z.email()),
  phone: z.string().trim().min(1).max(40),
  city: z.string().trim().min(1).max(80),
  country: z.string().trim().min(2).max(56),
  notes: z.string().max(2000),
})

export type CustomerDraft = z.infer<typeof customerDraftSchema>
