<script setup lang="ts">
import { useUiMentionsField, type MentionsFieldProps } from '@/composables/forms'

const props = withDefaults(defineProps<MentionsFieldProps>(), {
  size: 'md',
  trigger: '@',
})

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
} = useUiMentionsField(props)

function onInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  const val = target.value
  setValue(val)
  emit('update:modelValue', val)

  const lastTrigger = val.lastIndexOf(triggerChar.value)
  if (lastTrigger >= 0) {
    const afterTrigger = val.slice(lastTrigger + 1)
    if (!afterTrigger.includes(' ')) {
      query.value = afterTrigger
      isOpen.value = true
    } else {
      isOpen.value = false
      query.value = ''
    }
  } else {
    isOpen.value = false
    query.value = ''
  }
}

function onSelectMention(mention: { id: string; label: string }) {
  insertMention(mention)
  emit('update:modelValue', fieldValue.value ?? '')
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label
      v-if="label"
      v-bind="labelProps"
      class="text-surface-700 dark:text-surface-300 text-sm font-medium"
    >
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>

    <div class="relative" data-provider="reka" data-ui="mentions-field">
      <textarea
        :value="fieldValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        class="border-surface-300 dark:border-surface-600 dark:bg-surface-800 min-h-[80px] w-full resize-y rounded-md border bg-white px-3 py-2 text-sm"
        @input="onInput"
      />
      <div
        v-if="isOpen && filteredMentions.length"
        class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 absolute z-50 mt-1 max-h-40 w-full overflow-auto rounded-md border bg-white shadow-lg"
      >
        <button
          v-for="mention in filteredMentions"
          :key="mention.id"
          type="button"
          class="hover:bg-surface-100 dark:hover:bg-surface-700 flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
          @mousedown.prevent="onSelectMention(mention)"
        >
          <img
            v-if="mention.avatar"
            :src="mention.avatar"
            :alt="mention.label"
            class="h-5 w-5 rounded-full"
          />
          <span>{{ mention.label }}</span>
        </button>
      </div>
    </div>

    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p
      v-else-if="hint || description"
      v-bind="descriptionProps"
      class="text-surface-500 dark:text-surface-400 text-xs"
    >
      {{ hint || description }}
    </p>
  </div>
</template>
