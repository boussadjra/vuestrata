import { useSearchField } from '@formwerk/core'

import type { BaseFieldProps } from '@/types'

export interface SearchFieldProps extends BaseFieldProps {
  modelValue?: string
  placeholder?: string
  hint?: string
  clearButtonLabel?: string
}

export function useBaseSearchField(props: SearchFieldProps, onSearch: (value: string) => void) {
  const formwerk = useSearchField({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    schema: props.schema as undefined,
    placeholder: () => props.placeholder,
    clearButtonLabel: () => props.clearButtonLabel,
    onSubmit: onSearch,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
