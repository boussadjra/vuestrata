import {
  fromDate,
  getLocalTimeZone,
  toCalendarDate,
  toCalendarDateTime,
} from '@internationalized/date'
import type { DateValue } from 'reka-ui/date'
import { toDate as toNativeDate } from 'reka-ui/date'

export type UiDateGranularity = 'day' | 'minute' | 'second'

export function isNativeDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

export function inferDateGranularity(
  formatOptions?: Intl.DateTimeFormatOptions,
): UiDateGranularity {
  if (formatOptions?.second) return 'second'

  if (formatOptions?.minute || formatOptions?.hour) return 'minute'

  return 'day'
}

export function inferHourCycle(formatOptions?: Intl.DateTimeFormatOptions): 12 | 24 | undefined {
  if (formatOptions?.hour12 === true) return 12

  if (formatOptions?.hour12 === false) return 24

  return undefined
}

export function toDateValue(
  value: unknown,
  options: { includeTime?: boolean; timeZone?: string } = {},
): DateValue | undefined {
  if (!isNativeDate(value)) return undefined

  const zonedDate = fromDate(value, options.timeZone ?? getLocalTimeZone())
  return options.includeTime ? toCalendarDateTime(zonedDate) : toCalendarDate(zonedDate)
}

export function toDatePlaceholder(
  value: unknown,
  options: { includeTime?: boolean; timeZone?: string } = {},
): DateValue {
  return toDateValue(value, options) ?? toDateValue(new Date(), options)!
}

export function fromDateValue(value: DateValue | undefined, timeZone?: string): Date | undefined {
  return value ? toNativeDate(value, timeZone ?? getLocalTimeZone()) : undefined
}
