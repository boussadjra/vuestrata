import { useComboBox, useDefaultFilter } from '@formwerk/core'

import type { FieldProps } from '@/types'

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

export function useBaseComboBox(props: ComboBoxProps) {
  const { contains } = useDefaultFilter()

  const formwerk = useComboBox(
    {
      name: () => props.name,
      label: () => props.label ?? '',
      description: () => props.description ?? props.hint,
      modelValue: () => props.modelValue,
      disabled: () => props.disabled,
      readonly: () => props.readonly,
      required: () => props.required,
      schema: props.schema as undefined,
    },
    { filter: contains },
  )

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)
  const isOpen = formwerk.isPopupOpen
  const triggerProps = formwerk.buttonProps

  return { ...formwerk, displayError, isOpen, triggerProps }
}
