import { useDateField } from '@formwerk/core'

import type { BaseFieldProps } from '@/types'

export interface DateFieldProps extends BaseFieldProps {
  modelValue?: Date
  hint?: string
  locale?: string
  calendar?: string
  timeZone?: string
  formatOptions?: Intl.DateTimeFormatOptions
  placeholder?: string
  min?: string
  max?: string
}

export function useBaseDateField(props: DateFieldProps) {
  const formwerk = useDateField({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    schema: props.schema as undefined,
    locale: () => props.locale,
    calendar: () => props.calendar as undefined,
    timeZone: () => props.timeZone,
    formatOptions: () => props.formatOptions,
    placeholder: () => props.placeholder,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
