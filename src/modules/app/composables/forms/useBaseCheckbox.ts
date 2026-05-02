import { useCheckbox } from '@formwerk/core'

import type { BaseFieldProps } from '@/types'

export interface CheckboxProps extends Omit<BaseFieldProps, 'size'> {
  modelValue?: boolean | 'indeterminate'
  trueValue?: boolean
  falseValue?: boolean
  indeterminate?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function useBaseCheckbox(props: CheckboxProps) {
  const formwerk = useCheckbox({
    name: () => props.name,
    label: () => props.label ?? '',
    modelValue: () => props.modelValue as boolean | undefined,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    indeterminate: () => props.indeterminate,
    schema: props.schema as undefined,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
