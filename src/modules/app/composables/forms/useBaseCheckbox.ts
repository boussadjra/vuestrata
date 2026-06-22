import { useCheckbox } from '@formwerk/core'

import type { FieldProps } from '@/types'

export interface CheckboxProps extends Omit<FieldProps, 'size'> {
  modelValue?: boolean | 'indeterminate'
  checked?: boolean
  trueValue?: boolean
  falseValue?: boolean
  indeterminate?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function useBaseCheckbox(props: CheckboxProps) {
  const externalValue = computed(() => props.modelValue ?? props.checked)

  const baseOptions = {
    name: () => props.name,
    label: () => props.label ?? '',
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    trueValue: () => props.trueValue,
    falseValue: () => props.falseValue,
    indeterminate: () => props.indeterminate,
    schema: props.schema as undefined,
  }

  const formwerk =
    externalValue.value === undefined
      ? useCheckbox(baseOptions)
      : useCheckbox({
          ...baseOptions,
          modelValue: () => externalValue.value as boolean | undefined,
        })

  if (externalValue.value === undefined && props.name) {
    void nextTick(() => {
      void formwerk.validate()
    })
  }

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
