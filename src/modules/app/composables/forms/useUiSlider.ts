import { useSlider } from '@formwerk/core'

import type { FieldProps } from '@/types'

export interface SliderProps extends FieldProps {
  modelValue?: number
  min?: number
  max?: number
  step?: number
  orientation?: 'horizontal' | 'vertical'
  hint?: string
}

export function useUiSlider(props: SliderProps) {
  const formwerk = useSlider({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    min: () => props.min ?? 0,
    max: () => props.max ?? 100,
    step: () => props.step ?? 1,
    orientation: () => props.orientation ?? 'horizontal',
    schema: props.schema as undefined,
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage?.value)

  return { ...formwerk, displayError }
}
