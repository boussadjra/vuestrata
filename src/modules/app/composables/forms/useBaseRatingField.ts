import { useCustomField } from '@formwerk/core'

import type { BaseFieldProps } from '@/types'

export interface RatingFieldProps extends BaseFieldProps {
  modelValue?: number
  max?: number
  hint?: string
  allowHalf?: boolean
}

export function useBaseRatingField(props: RatingFieldProps) {
  const formwerk = useCustomField<number>({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue ?? 0,
    disabled: () => props.disabled,
    schema: props.schema as undefined,
  })

  const maxStars = computed(() => props.max ?? 5)

  function setRating(value: number) {
    if (!props.disabled && !props.readonly) {
      formwerk.setValue(value)
    }
  }

  const displayError = computed(() => props.error ?? formwerk.errorMessage?.value)

  return { ...formwerk, displayError, maxStars, setRating }
}
