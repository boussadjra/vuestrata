import { useCheckbox } from '@formwerk/core'

import type { FieldProps } from '@/types'

import { useOwnDefault } from './useOwnDefault'

export interface CheckboxProps extends Omit<FieldProps, 'size'> {
  modelValue?: boolean | 'indeterminate'
  checked?: boolean
  trueValue?: boolean
  falseValue?: boolean
  indeterminate?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function useUiCheckbox(props: CheckboxProps) {
  const ownDefault = useOwnDefault(props)
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

  // Unchecked unless told otherwise, which is what an absent `checked` used to
  // be cast to. Passed as the field's own default, so that inside a form it
  // yields to the record's value instead of unchecking it.
  const formwerk = useCheckbox({
    ...baseOptions,
    modelValue: () => (externalValue.value ?? ownDefault(false)) as boolean | undefined,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
