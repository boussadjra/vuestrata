import type { FieldProps } from '@/types'

export interface ToggleGroupOption {
  label: string
  value: string
  disabled?: boolean
}

export interface ToggleGroupProps extends Omit<FieldProps, 'size'> {
  modelValue?: string | string[]
  options: ToggleGroupOption[]
  multiple?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function useBaseToggleGroup(
  props: ToggleGroupProps,
  emit: (event: 'update:modelValue', value: string | string[]) => void,
) {
  function isSelected(value: string): boolean {
    if (props.multiple && Array.isArray(props.modelValue)) {
      return props.modelValue.includes(value)
    }
    return props.modelValue === value
  }

  function toggleValue(value: string) {
    if (props.disabled) return
    if (props.multiple) {
      const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
      const idx = current.indexOf(value)
      if (idx >= 0) {
        current.splice(idx, 1)
      } else {
        current.push(value)
      }
      emit('update:modelValue', current)
    } else {
      emit('update:modelValue', props.modelValue === value ? '' : value)
    }
  }

  return { isSelected, toggleValue }
}
