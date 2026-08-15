/**
 * The month view's reactive workflow.
 *
 * Which month is shown, which day is selected, how the arrow keys move through
 * the grid, and which events land in which cell. None of it depends on the URL,
 * and all of it is the calendar feature's own behaviour — a month view embedded
 * in a dialog needs exactly this and no routing.
 *
 * The date arithmetic itself stays in `useMonthGrid`, which is pure.
 */
import type { MaybeRefOrGetter } from 'vue'

import type { CalendarEvent, CalendarFilters, EventKind } from '../types'
import { useEventsQuery } from './useCalendar'
import {
  buildMonthGrid,
  horizontalStep,
  monthRange,
  toDateKey,
  weekdayLabels,
} from './useMonthGrid'

/** Rows the arrow keys skip when moving vertically — one week. */
const DAYS_PER_WEEK = 7

/** Events bucketed by local ISO date, so a cell lookup is O(1). */
export function groupEventsByDay(events: readonly CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const key = toDateKey(new Date(event.startsAt))
    const bucket = map.get(key)
    if (bucket) bucket.push(event)
    else map.set(key, [event])
  }
  return map
}

/** First of the month, so month arithmetic never lands on the 31st of a 30-day month. */
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function useCalendarMonth(locale: MaybeRefOrGetter<string>) {
  const activeLocale = computed(() => toValue(locale))

  const viewMonth = ref(startOfMonth(new Date()))
  const selectedKey = ref(toDateKey(new Date()))
  const kind = ref<EventKind | 'all'>('all')

  const grid = computed(() => buildMonthGrid(viewMonth.value, activeLocale.value))
  const weekdays = computed(() => weekdayLabels(activeLocale.value))

  const filters = computed<CalendarFilters>(() => ({
    ...monthRange(viewMonth.value, activeLocale.value),
    kind: kind.value,
    // The grid is six weeks; no month has more events than this, and paginating
    // a calendar is not a concept.
    pageSize: 100,
    sortBy: 'startsAt',
    sortOrder: 'asc',
  }))

  const { items, isPending, isError, refetch } = useEventsQuery(filters)

  const eventsByDay = computed(() => groupEventsByDay(items.value))
  const selectedEvents = computed(() => eventsByDay.value.get(selectedKey.value) ?? [])

  function eventsOn(key: string): CalendarEvent[] {
    return eventsByDay.value.get(key) ?? []
  }

  function shiftMonth(delta: number) {
    const next = new Date(viewMonth.value)
    next.setMonth(next.getMonth() + delta)
    viewMonth.value = next
  }

  function selectDay(key: string) {
    selectedKey.value = key
  }

  function goToToday() {
    const now = new Date()
    viewMonth.value = startOfMonth(now)
    selectedKey.value = toDateKey(now)
  }

  /**
   * Arrow-key movement across the grid.
   *
   * Moving past the first or last cell pulls the view to the adjacent month
   * rather than stopping dead — the alternative is a user pressing ArrowRight
   * on the 31st and nothing happening, with no indication why.
   *
   * Returns whether the key was handled, so the caller knows when to
   * `preventDefault` and when to leave the event alone.
   */
  function moveSelection(key: string): boolean {
    const steps: Record<string, number> = {
      ArrowLeft: horizontalStep('ArrowLeft', activeLocale.value),
      ArrowRight: horizontalStep('ArrowRight', activeLocale.value),
      ArrowUp: -DAYS_PER_WEEK,
      ArrowDown: DAYS_PER_WEEK,
    }
    const step = steps[key]
    if (step === undefined) return false

    const current = new Date(`${selectedKey.value}T00:00:00`)
    current.setDate(current.getDate() + step)
    selectedKey.value = toDateKey(current)

    if (current.getMonth() !== viewMonth.value.getMonth()) {
      viewMonth.value = startOfMonth(current)
    }
    return true
  }

  return {
    viewMonth,
    selectedKey,
    kind,
    grid,
    weekdays,
    eventsByDay,
    eventsOn,
    selectedEvents,
    isPending,
    isError,
    refetch,
    shiftMonth,
    selectDay,
    goToToday,
    moveSelection,
  }
}
