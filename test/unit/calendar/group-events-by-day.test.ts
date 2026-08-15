/**
 * Event bucketing for the month grid.
 *
 * Keyed by LOCAL date, which is the whole point: `toISOString()` shifts to UTC
 * and can move an evening event into the next day's cell.
 */
import { describe, it, expect } from 'vite-plus/test'

import { groupEventsByDay } from '@/modules/calendar/composables/useCalendarMonth'
import { toDateKey } from '@/modules/calendar/composables/useMonthGrid'
import type { CalendarEvent } from '@/modules/calendar/types'

function event(startsAt: Date, id = 'e-1'): CalendarEvent {
  const ends = new Date(startsAt.getTime() + 60 * 60 * 1000)
  return {
    id,
    title: 'Standup',
    kind: 'meeting',
    startsAt: startsAt.toISOString(),
    endsAt: ends.toISOString(),
    allDay: false,
    location: 'Room 2',
    attendees: [],
    organizer: 'Ada',
  }
}

describe('groupEventsByDay', () => {
  it('buckets events under their local date key', () => {
    const day = new Date(2026, 4, 12, 9, 30)
    const map = groupEventsByDay([event(day)])

    expect(map.get(toDateKey(day))).toHaveLength(1)
  })

  it('keeps several events on the same day together', () => {
    const morning = new Date(2026, 4, 12, 9, 0)
    const evening = new Date(2026, 4, 12, 18, 0)
    const map = groupEventsByDay([event(morning, 'e-1'), event(evening, 'e-2')])

    expect(map.get(toDateKey(morning))!.map((entry) => entry.id)).toEqual(['e-1', 'e-2'])
  })

  it('separates events on different days', () => {
    const first = new Date(2026, 4, 12, 9, 0)
    const second = new Date(2026, 4, 13, 9, 0)
    const map = groupEventsByDay([event(first, 'e-1'), event(second, 'e-2')])

    expect(map.size).toBe(2)
  })

  it('returns an empty map for no events', () => {
    expect(groupEventsByDay([]).size).toBe(0)
  })
})
