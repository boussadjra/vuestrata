import { useCalendar } from '@formwerk/core'

import type { FieldProps } from '@/types'

export interface CalendarProps extends Omit<FieldProps, 'size'> {
  modelValue?: Date
  locale?: string
  calendar?: string
  timeZone?: string
  min?: string
  max?: string
}

export function useBaseCalendar(props: CalendarProps) {
  const formwerk = useCalendar({
    label: () => props.label ?? '',
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    locale: () => props.locale,
    calendar: () => props.calendar as undefined,
  })

  return { ...formwerk }
}
