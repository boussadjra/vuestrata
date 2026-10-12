import { useSwitch } from '@formwerk/core'

import type { FieldProps } from '@/types'

import { useOwnDefault } from './useOwnDefault'

export interface SwitchProps extends Omit<FieldProps, 'size'> {
  modelValue?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function useUiSwitch(props: SwitchProps) {
  const ownDefault = useOwnDefault(props)

  const formwerk = useSwitch({
    name: () => props.name,
    label: () => props.label ?? '',
    modelValue: () => props.modelValue ?? ownDefault(false),
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    schema: props.schema as undefined,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
