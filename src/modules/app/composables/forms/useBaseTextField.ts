import { useTextField } from '@formwerk/core'

import type { BaseFieldProps } from '@/types'

export interface TextFieldProps extends BaseFieldProps {
  modelValue?: string
  type?: 'text' | 'email' | 'password' | 'tel' | 'url'
  placeholder?: string
  hint?: string
}

export function useBaseTextField(props: TextFieldProps) {
  const formwerk = useTextField({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    schema: props.schema as undefined,
    type: () => props.type,
    placeholder: () => props.placeholder,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
