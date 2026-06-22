import { useSwitch } from '@formwerk/core'

import type { FieldProps } from '@/types'

export interface SwitchProps extends Omit<FieldProps, 'size'> {
  modelValue?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function useBaseSwitch(props: SwitchProps) {
  const formwerk = useSwitch({
    name: () => props.name,
    label: () => props.label ?? '',
    modelValue: () => props.modelValue,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    schema: props.schema as undefined,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
