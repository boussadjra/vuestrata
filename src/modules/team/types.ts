import { z } from 'zod'

import type { CollectionFilters } from '~/lib/api/collection-queries'

/**
 * Team directory contract.
 *
 * Deliberately separate from the `users` module. `users` is access
 * administration — who may do what — while this is the people directory: who
 * someone is, what they work on, how to reach them. Merging them puts a
 * permission matrix on a profile page and a phone number in an access review.
 */

export const TEAM_DEPARTMENTS = [
  'engineering',
  'design',
  'sales',
  'support',
  'operations',
  'finance',
] as const
export type TeamDepartment = (typeof TEAM_DEPARTMENTS)[number]

export const memberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  title: z.string(),
  department: z.enum(TEAM_DEPARTMENTS),
  location: z.string(),
  /** IANA timezone. Needed to say whether someone is likely to be awake. */
  timezone: z.string(),
  /** Display name of this person's manager, or `null` for the top of the tree. */
  manager: z.string().nullable(),
  skills: z.array(z.string()),
  joinedAt: z.string(),
  /** Availability the person set themselves. */
  status: z.enum(['available', 'busy', 'away', 'on_leave']),
})

export type TeamMember = z.infer<typeof memberSchema>

export interface TeamFilters extends CollectionFilters {
  department?: TeamDepartment | 'all'
}
