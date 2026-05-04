<script setup lang="ts">
import { useBaseMentionsField, type MentionsFieldProps } from '@/components/ui/base'

const props = withDefaults(defineProps<MentionsFieldProps>(), { size: 'md', trigger: '@' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const {
  fieldValue,
  setValue,
  isOpen,
  filteredMentions,
  insertMention,
  query,
  triggerChar,
  labelProps,
  errorMessageProps,
  descriptionProps,
  displayError,
} = useBaseMentionsField(props)

function onInput(e: Event) {
  const val = (e.target as HTMLTextAreaElement).value
  setValue(val)
  emit('update:modelValue', val)
  const lastTrigger = val.lastIndexOf(triggerChar.value)
  if (lastTrigger >= 0) {
    const after = val.slice(lastTrigger + 1)
    if (!after.includes(' ')) {
      query.value = after
      isOpen.value = true
    } else {
      isOpen.value = false
    }
  } else {
    isOpen.value = false
  }
}

function onMentionMouseDown(id: string) {
  const mention = filteredMentions.value.find((m) => m.id === id)
  if (!mention) return
  insertMention(mention)
  emit('update:modelValue', fieldValue.value ?? '')
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">{{ label }}</label>
    <div class="relative" data-provider="vuetify0" data-ui="mentions-field">
      <textarea
        :value="fieldValue"
        :placeholder="placeholder"
        :disabled="disabled"
        class="min-h-20 w-full rounded border px-3 py-2 text-sm"
        @input="onInput"
      />
      <div
        v-if="isOpen && filteredMentions.length"
        class="dark:bg-surface-800 absolute z-50 mt-1 max-h-40 w-full overflow-auto rounded border bg-white shadow"
      >
        <button
          v-for="m in filteredMentions"
          :key="m.id"
          type="button"
          class="hover:bg-surface-100 w-full px-3 py-2 text-left text-sm"
          @mousedown.prevent="onMentionMouseDown(m.id)"
        >
          {{ m.label }}
        </button>
      </div>
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
