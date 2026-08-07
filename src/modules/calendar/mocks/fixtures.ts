/**
 * Seeded calendar events.
 *
 * Spread across the current month and the two either side of it, relative to
 * the fixture epoch, so the calendar always opens on a month with something in
 * it. A fixed date range would leave the demo showing an empty grid the moment
 * the reader navigates away from whenever the data was authored.
 */
import { PEOPLE_NAMES, createRng, daysFromNow, pick, pickMany, randomInt } from '~/mocks/seed'

import { EVENT_KINDS, type CalendarEvent, type EventKind } from '../types'

interface Template {
  title: string
  kind: EventKind
  /** Duration in minutes. Ignored for all-day events. */
  minutes: number
  location: string
  allDay?: boolean
}

const TEMPLATES: Template[] = [
  { title: 'Sprint planning', kind: 'meeting', minutes: 90, location: 'Room 2.4 / Zoom' },
  { title: 'Customer QBR — Northwind', kind: 'meeting', minutes: 60, location: 'Zoom' },
  { title: 'Design review: portal redesign', kind: 'review', minutes: 45, location: 'Room 1.1' },
  {
    title: 'Firmware 3.0 release cutoff',
    kind: 'deadline',
    minutes: 0,
    location: '',
    allDay: true,
  },
  { title: 'Database maintenance window', kind: 'maintenance', minutes: 180, location: 'Remote' },
  { title: 'Security patch rollout', kind: 'maintenance', minutes: 120, location: 'Remote' },
  { title: 'Quarterly board meeting', kind: 'meeting', minutes: 150, location: 'Boardroom' },
  { title: 'SOC 2 evidence deadline', kind: 'deadline', minutes: 0, location: '', allDay: true },
  { title: 'Architecture review', kind: 'review', minutes: 60, location: 'Room 3.2' },
  { title: 'Onboarding: new engineers', kind: 'meeting', minutes: 120, location: 'Room 1.1' },
  { title: 'Public holiday', kind: 'holiday', minutes: 0, location: '', allDay: true },
  { title: 'Warehouse cutover rehearsal', kind: 'review', minutes: 240, location: 'Hamburg' },
  { title: 'Pricing workshop', kind: 'meeting', minutes: 90, location: 'Room 2.4' },
  { title: 'Invoice run', kind: 'deadline', minutes: 0, location: '', allDay: true },
  { title: 'Incident post-mortem', kind: 'review', minutes: 60, location: 'Zoom' },
]

export function createEventFixtures(count = 60): CalendarEvent[] {
  const rng = createRng(30_517)

  return Array.from({ length: count }, (_, index) => {
    const template = TEMPLATES[index % TEMPLATES.length]!
    // −45 to +45 days: roughly three months of coverage centred on today.
    const dayOffset = randomInt(rng, -45, 45)
    const hour = template.allDay ? 0 : randomInt(rng, 8, 17)

    const startsAt = daysFromNow(dayOffset, hour, template.allDay ? 0 : pick(rng, [0, 30]))
    const endsAt = template.allDay
      ? daysFromNow(dayOffset, 23, 59)
      : new Date(Date.parse(startsAt) + template.minutes * 60_000).toISOString()

    return {
      id: `EVT-${String(1000 + index)}`,
      title: template.title,
      kind: template.kind,
      startsAt,
      endsAt,
      allDay: template.allDay ?? false,
      location: template.location,
      // A holiday has no attendee list; giving one four invitees is the kind of
      // detail that quietly signals the data was generated without thought.
      attendees:
        template.kind === 'holiday' ? [] : pickMany(rng, PEOPLE_NAMES, randomInt(rng, 2, 6)),
      organizer: pick(rng, PEOPLE_NAMES),
    } satisfies CalendarEvent
  })
}

export const eventFixtures = createEventFixtures()
export const EVENT_KIND_LIST = EVENT_KINDS
