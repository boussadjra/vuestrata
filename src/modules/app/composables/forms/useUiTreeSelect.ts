import { useCustomField } from '@formwerk/core'

import type { FieldProps } from '@/types'

export interface TreeNode {
  label: string
  value: string
  children?: TreeNode[]
  disabled?: boolean
}

export interface TreeSelectProps extends FieldProps {
  modelValue?: string | string[]
  nodes: TreeNode[]
  hint?: string
  placeholder?: string
  multiple?: boolean
}

export function useUiTreeSelect(props: TreeSelectProps) {
  const formwerk = useCustomField<string | string[]>({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    disabled: () => props.disabled,
    required: () => props.required,
    schema: props.schema as undefined,
    modelValue: () => props.modelValue ?? (props.multiple ? [] : ''),
  })

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  return { ...formwerk, displayError }
}
