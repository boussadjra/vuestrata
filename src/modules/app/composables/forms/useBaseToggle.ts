import { useCheckbox } from '@formwerk/core'

import type { BaseFieldProps } from '@/types'

export interface ToggleProps extends Omit<BaseFieldProps, 'size'> {
  modelValue?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function useBaseToggle(props: ToggleProps) {
  return useCheckbox({
    name: () => props.name,
    label: () => props.label ?? '',
    modelValue: () => props.modelValue,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    schema: props.schema as undefined,
  })
}
