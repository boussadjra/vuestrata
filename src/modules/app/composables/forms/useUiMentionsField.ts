import { useCustomField } from '@formwerk/core'

import type { FieldProps } from '@/types'

export interface MentionsFieldProps extends FieldProps {
  modelValue?: string
  placeholder?: string
  hint?: string
  mentions?: MentionItem[]
  trigger?: string
}

export interface MentionItem {
  id: string
  label: string
  avatar?: string
}

export function useUiMentionsField(props: MentionsFieldProps) {
  const formwerk = useCustomField<string>({
    name: () => props.name,
    label: () => props.label ?? '',
    description: () => props.description ?? props.hint,
    modelValue: () => props.modelValue ?? '',
    disabled: () => props.disabled,
    schema: props.schema as undefined,
  })

  const query = ref('')
  const isOpen = ref(false)
  const triggerChar = computed(() => props.trigger ?? '@')

  const filteredMentions = computed(() => {
    if (!query.value || !props.mentions) return []
    const q = query.value.toLowerCase()
    return props.mentions.filter((m) => m.label.toLowerCase().includes(q))
  })

  function insertMention(mention: MentionItem) {
    const current = formwerk.fieldValue.value ?? ''
    const triggerIndex = current.lastIndexOf(triggerChar.value)
    if (triggerIndex >= 0) {
      const before = current.slice(0, triggerIndex)
      formwerk.setValue(`${before}${triggerChar.value}${mention.label} `)
    }
    isOpen.value = false
    query.value = ''
  }

  const displayError = computed(() => props.error ?? formwerk.errorMessage?.value)

  return {
    ...formwerk,
    displayError,
    query,
    isOpen,
    filteredMentions,
    insertMention,
    triggerChar,
  }
}
