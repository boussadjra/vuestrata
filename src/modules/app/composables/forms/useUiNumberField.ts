import { useNumberField } from '@formwerk/core'

import type { FieldProps } from '@/types'

export interface NumberFieldProps extends FieldProps {
  modelValue?: number
  placeholder?: string
  hint?: string
  min?: number
  max?: number
  step?: number
  locale?: string
  formatOptions?: Intl.NumberFormatOptions
}

export function useUiNumberField(props: NumberFieldProps) {
  const formwerk = useNumberField({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    schema: props.schema as undefined,
    placeholder: () => props.placeholder,
    min: () => props.min,
    max: () => props.max,
    step: () => props.step,
    locale: () => props.locale,
    formatOptions: () => props.formatOptions,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
