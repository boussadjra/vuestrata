import { useCustomField } from '@formwerk/core'

import type { BaseFieldProps } from '@/types'

export interface TreeNode {
  label: string
  value: string
  children?: TreeNode[]
  disabled?: boolean
}

export interface TreeSelectProps extends BaseFieldProps {
  modelValue?: string | string[]
  nodes: TreeNode[]
  hint?: string
  placeholder?: string
  multiple?: boolean
}

export function useBaseTreeSelect(props: TreeSelectProps) {
  const formwerk = useCustomField<string | string[]>({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    disabled: () => props.disabled,
    required: () => props.required,
    schema: props.schema as undefined,
    modelValue: () => props.modelValue ?? (props.multiple ? [] : ''),
  })

  const expandedNodes = ref<Set<string>>(new Set())

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  function toggleExpand(nodeValue: string) {
    const next = new Set(expandedNodes.value)
    if (next.has(nodeValue)) {
      next.delete(nodeValue)
    } else {
      next.add(nodeValue)
    }
    expandedNodes.value = next
  }

  function isExpanded(nodeValue: string) {
    return expandedNodes.value.has(nodeValue)
  }

  function selectNode(nodeValue: string) {
    if (props.multiple) {
      const current = ((formwerk.fieldValue.value as string[] | undefined) ?? []) as string[]
      if (current.includes(nodeValue)) {
        formwerk.setValue(current.filter((v) => v !== nodeValue))
      } else {
        formwerk.setValue([...current, nodeValue])
      }
    } else {
      formwerk.setValue(nodeValue)
    }
  }

  function isSelected(nodeValue: string) {
    const val = formwerk.fieldValue.value
    if (props.multiple) {
      return Array.isArray(val) && val.includes(nodeValue)
    }
    return val === nodeValue
  }

  return {
    ...formwerk,
    displayError,
    expandedNodes,
    toggleExpand,
    isExpanded,
    selectNode,
    isSelected,
  }
}
