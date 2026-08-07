/**
 * Month grid arithmetic.
 *
 * Kept out of the page because dates are where calendars go wrong, and the
 * failures are seasonal: a grid built by adding 86 400 000 ms per day loses or
 * gains an hour at a daylight-saving boundary and duplicates or skips a day
 * roughly twice a year. Every step here goes through `Date#setDate`, which the
 * runtime normalizes across DST, month ends and leap years.
 */
import { isRtlLocale } from '~/plugins/appearance'

export interface MonthDay {
  date: Date
  /** ISO date (YYYY-MM-DD) — the key events are bucketed by. */
  key: string
  dayOfMonth: number
  /** False for the leading/trailing days borrowed from the adjacent months. */
  inMonth: boolean
  isToday: boolean
}

/** Local ISO date, not `toISOString()` — the latter shifts to UTC and can move the day. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/**
 * The first day of the week for a locale.
 *
 * Hardcoding Monday is wrong for en-US and most of the Arabic-speaking world;
 * hardcoding Sunday is wrong for most of Europe. `Intl.Locale#getWeekInfo` knows
 * (1 = Monday … 7 = Sunday); older engines do not expose it, so Monday is the
 * fallback and the grid stays coherent either way.
 */
export function firstDayOfWeek(locale: string): number {
  try {
    const info = (
      new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number } }
    ).getWeekInfo?.()
    return info?.firstDay ?? 1
  } catch {
    return 1
  }
}

/**
 * Six weeks of days covering `month`, always.
 *
 * Fixed at 42 cells rather than 28–42: a grid whose height changes between
 * March and April makes the whole page jump on every month change.
 */
export function buildMonthGrid(month: Date, locale: string): MonthDay[] {
  const weekStart = firstDayOfWeek(locale) % 7 // Intl's 7 (Sunday) → JS 0
  const today = toDateKey(new Date())

  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  // How many days to reach back to land on the locale's first weekday.
  const lead = (first.getDay() - weekStart + 7) % 7

  const cursor = startOfDay(first)
  cursor.setDate(cursor.getDate() - lead)

  return Array.from({ length: 42 }, () => {
    const date = new Date(cursor)
    const key = toDateKey(date)
    cursor.setDate(cursor.getDate() + 1)
    return {
      date,
      key,
      dayOfMonth: date.getDate(),
      inMonth: date.getMonth() === month.getMonth(),
      isToday: key === today,
    }
  })
}

/** Weekday headers in the locale's own order and script. */
export function weekdayLabels(locale: string, format: 'short' | 'narrow' = 'short'): string[] {
  const weekStart = firstDayOfWeek(locale) % 7
  const formatter = new Intl.DateTimeFormat(locale, { weekday: format })

  // 2024-01-07 was a Sunday, which makes index 0 = Sunday and the modulo below
  // trivially correct. Any known Sunday would do; this one avoids a leap year.
  const reference = new Date(2024, 0, 7)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(reference)
    day.setDate(reference.getDate() + ((weekStart + index) % 7))
    return formatter.format(day)
  })
}

/** Inclusive ISO bounds covering the whole grid, for the range query. */
export function monthRange(month: Date, locale: string): { from: string; to: string } {
  const days = buildMonthGrid(month, locale)
  const first = days[0]!.date
  const last = new Date(days[days.length - 1]!.date)
  last.setHours(23, 59, 59, 999)
  return { from: first.toISOString(), to: last.toISOString() }
}

/**
 * Arrow-key direction, adjusted for writing direction.
 *
 * In an RTL calendar the visually-previous day is to the *right*, so pressing
 * ArrowRight must move backwards. Without this, keyboard navigation runs
 * backwards through the grid for Arabic readers.
 */
export function horizontalStep(key: 'ArrowLeft' | 'ArrowRight', locale: string): number {
  const rtl = isRtlLocale(locale)
  if (key === 'ArrowRight') return rtl ? -1 : 1
  return rtl ? 1 : -1
}
