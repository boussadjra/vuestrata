import { useCheckbox } from '@formwerk/core'

import type { FieldProps } from '@/types'

import { useOwnDefault } from './useOwnDefault'

export interface ToggleProps extends Omit<FieldProps, 'size'> {
  modelValue?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function useUiToggle(props: ToggleProps) {
  const ownDefault = useOwnDefault(props)

  return useCheckbox({
    name: () => props.name,
    label: () => props.label ?? '',
    modelValue: () => props.modelValue ?? ownDefault(false),
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    schema: props.schema as undefined,
  })
}
