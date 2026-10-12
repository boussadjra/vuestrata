import { useCustomField } from '@formwerk/core'

import type { FieldProps } from '@/types'

import { useOwnDefault } from './useOwnDefault'

export interface ComboBoxOption {
  label: string
  value: string
  disabled?: boolean
}

export interface ComboBoxProps extends FieldProps {
  modelValue?: string | string[]
  options: ComboBoxOption[]
  placeholder?: string
  hint?: string
  openOnFocus?: boolean
}

export function useUiComboBox(props: ComboBoxProps) {
  const ownDefault = useOwnDefault(props)

  const formwerk = useCustomField<string | string[]>({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue ?? ownDefault(''),
    disabled: () => props.disabled,
    required: () => props.required,
    schema: props.schema as undefined,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
