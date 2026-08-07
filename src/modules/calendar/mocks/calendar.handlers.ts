/** Calendar mock backend — demo builds only. */
import { createCollectionMock } from '~/mocks/collection'

import { calendarEventDraftSchema, type CalendarEvent } from '../types'
import { eventFixtures } from './fixtures'

const calendarMock = createCollectionMock<CalendarEvent>({
  resource: 'events',
  seed: eventFixtures,
  searchFields: ['title', 'location', 'organizer'],
  filterFields: ['kind'],
  // The month view asks for a date window, which no exact-match filter can
  // express.
  rangeField: 'startsAt',
  defaultSort: { by: 'startsAt', order: 'asc' },

  create: (body, existing) => {
    const parsed = calendarEventDraftSchema.safeParse(body)
    if (!parsed.success) return null
    // An event that ends before it starts is the one invariant a calendar
    // cannot render at all, so it is rejected rather than stored.
    if (Date.parse(parsed.data.endsAt) < Date.parse(parsed.data.startsAt)) return null

    return {
      ...parsed.data,
      id: `EVT-${1000 + existing.length}`,
      attendees: [],
      organizer: 'You',
    }
  },

  update: (record, body) => {
    const parsed = calendarEventDraftSchema.partial().safeParse(body)
    if (!parsed.success) return null
    const next = { ...record, ...parsed.data }
    if (Date.parse(next.endsAt) < Date.parse(next.startsAt)) return null
    return next
  },
})

export const calendarHandlers = calendarMock.handlers
export const resetCalendarMock = calendarMock.reset
