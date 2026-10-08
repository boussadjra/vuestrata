import { useCustomField } from '@formwerk/core'

import type { FieldProps } from '@/types'

import { useOwnDefault } from './useOwnDefault'

export interface ColorPickerProps extends FieldProps {
  modelValue?: string
  hint?: string
  swatches?: string[]
  format?: 'hex' | 'rgb' | 'hsl'
}

export function useUiColorPicker(props: ColorPickerProps) {
  const ownDefault = useOwnDefault(props)

  const formwerk = useCustomField<string>({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue ?? ownDefault('#000000'),
    disabled: () => props.disabled,
    schema: props.schema as undefined,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage?.value)

  return { ...formwerk, displayError }
}
