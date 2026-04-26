import { useCustomField } from '@formwerk/core'

import type { BaseFieldProps } from '@/types'

export interface EditableProps extends BaseFieldProps {
  modelValue?: string
  placeholder?: string
  hint?: string
}

export function useBaseEditable(props: EditableProps) {
  const formwerk = useCustomField<string>({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue ?? '',
    disabled: () => props.disabled,
    schema: props.schema as undefined,
  })

  const isEditing = ref(false)

  function startEditing() {
    if (!props.disabled && !props.readonly) {
      isEditing.value = true
    }
  }

  function stopEditing() {
    isEditing.value = false
  }

  const displayError = computed(() => props.error ?? formwerk.errorMessage?.value)

  return { ...formwerk, displayError, isEditing, startEditing, stopEditing }
}
