import { useCustomField } from '@formwerk/core'

import type { FieldProps } from '@/types'

export interface TagsFieldProps extends FieldProps {
  modelValue?: string[]
  hint?: string
  placeholder?: string
  maxTags?: number
  allowDuplicates?: boolean
}

export function useBaseTagsField(props: TagsFieldProps) {
  const formwerk = useCustomField<string[]>({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    disabled: () => props.disabled,
    required: () => props.required,
    schema: props.schema as undefined,
    modelValue: () => props.modelValue ?? [],
  })

  const inputText = ref('')

  const displayError = computed(() => props.error ?? formwerk.errorMessage.value)

  function addTag(tag: string) {
    const trimmed = tag.trim()
    if (!trimmed) return
    const current = (formwerk.fieldValue.value as string[] | undefined) ?? []
    if (!props.allowDuplicates && current.includes(trimmed)) return
    if (props.maxTags && current.length >= props.maxTags) return
    formwerk.setValue([...current, trimmed])
    inputText.value = ''
  }

  function removeTag(index: number) {
    const current = (formwerk.fieldValue.value as string[] | undefined) ?? []
    formwerk.setValue(current.filter((_, i) => i !== index))
  }

  return { ...formwerk, displayError, inputText, addTag, removeTag }
}
