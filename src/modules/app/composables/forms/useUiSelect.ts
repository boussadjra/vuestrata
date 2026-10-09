import { useCustomField } from '@formwerk/core'

import type { FieldProps } from '@/types'

import { useOwnDefault } from './useOwnDefault'

export interface SelectOption {
  label: string
  value: string | number
  disabled?: boolean
}

export interface SelectOptionGroup {
  label: string
  options: SelectOption[]
}

export interface SelectProps extends FieldProps {
  modelValue?: string | number | Array<string | number>
  options: (SelectOption | SelectOptionGroup)[]
  placeholder?: string
  hint?: string
  multiple?: boolean
}

export function useUiSelect(props: SelectProps) {
  const ownDefault = useOwnDefault(props)

  const formwerk = useCustomField<string | number | Array<string | number>>({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    schema: props.schema as undefined,
    modelValue: () => props.modelValue ?? ownDefault(props.multiple ? [] : ''),
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
