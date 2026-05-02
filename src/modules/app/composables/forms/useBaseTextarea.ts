import { useTextField } from '@formwerk/core'

import type { BaseFieldProps } from '@/types'

export interface TextareaProps extends BaseFieldProps {
  modelValue?: string
  placeholder?: string
  hint?: string
  rows?: number
  maxlength?: number
  resize?: 'none' | 'vertical' | 'both'
}

export function useBaseTextarea(props: TextareaProps) {
  const formwerk = useTextField({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    schema: props.schema as undefined,
    placeholder: () => props.placeholder,
    maxLength: () => props.maxlength,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
