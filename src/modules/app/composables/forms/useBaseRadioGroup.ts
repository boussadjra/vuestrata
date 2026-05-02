import { useRadioGroup } from '@formwerk/core'

import type { BaseFieldProps } from '@/types'

export interface RadioOption {
  label: string
  value: string
  disabled?: boolean
  description?: string
}

export interface RadioGroupProps extends BaseFieldProps {
  modelValue?: string
  options: RadioOption[]
  hint?: string
  orientation?: 'vertical' | 'horizontal'
}

export function useBaseRadioGroup(props: RadioGroupProps) {
  const formwerk = useRadioGroup({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    orientation: () => props.orientation,
    schema: props.schema as undefined,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
