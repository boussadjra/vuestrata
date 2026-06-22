import { useSelect, useOption, useOptionGroup } from '@formwerk/core'

import type { FieldProps } from '@/types'

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

export function useBaseSelect(props: SelectProps) {
  const formwerk = useSelect({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    schema: props.schema as undefined,
    multiple: () => props.multiple,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)
  const isOpen = formwerk.isPopupOpen

  return { ...formwerk, displayError, isOpen }
}

export function useBaseOption(props: {
  label: string
  value: string | number
  disabled?: boolean
}) {
  return useOption({
    label: () => props.label,
    value: () => props.value,
    disabled: () => props.disabled,
  })
}

export function useBaseOptionGroup(props: { label: string }) {
  return useOptionGroup({
    label: () => props.label,
  })
}
