import { useTimeField } from '@formwerk/core'

import type { BaseFieldProps } from '@/types'

export interface TimeFieldProps extends BaseFieldProps {
  modelValue?: string
  hint?: string
  locale?: string
  formatOptions?: Intl.DateTimeFormatOptions
  placeholder?: string
  hour12?: boolean
}

export function useBaseTimeField(props: TimeFieldProps) {
  const formwerk = useTimeField({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    schema: props.schema as undefined,
    locale: () => props.locale,
    formatOptions: () => props.formatOptions,
    placeholder: () => props.placeholder,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
