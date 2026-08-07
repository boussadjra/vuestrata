import { z } from 'zod'

import type { CollectionFilters } from '~/lib/api/collection-queries'

/** Calendar event contract. */

export const EVENT_KINDS = ['meeting', 'deadline', 'review', 'maintenance', 'holiday'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export const calendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(EVENT_KINDS),
  /**
   * Start and end are full ISO timestamps, always. Storing a date and a
   * separate time string is what makes an event that crosses midnight — or a
   * timezone — impossible to reason about.
   */
  startsAt: z.string(),
  endsAt: z.string(),
  /** All-day events still carry timestamps; this says how to display them. */
  allDay: z.boolean(),
  location: z.string(),
  attendees: z.array(z.string()),
  organizer: z.string(),
})

export type CalendarEvent = z.infer<typeof calendarEventSchema>

export interface CalendarFilters extends CollectionFilters {
  kind?: EventKind | 'all'
  /** Inclusive ISO date bounds for the visible month. */
  from?: string
  to?: string
}

export const calendarEventDraftSchema = calendarEventSchema.pick({
  title: true,
  kind: true,
  startsAt: true,
  endsAt: true,
  allDay: true,
  location: true,
})

export type CalendarEventDraft = z.infer<typeof calendarEventDraftSchema>
