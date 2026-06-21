<script setup lang="ts">
import { useBaseTagsField, type TagsFieldProps } from '@/components/ui/base'

const props = withDefaults(defineProps<TagsFieldProps & { provider: 'reka' }>(), {
  placeholder: 'Add tag...',
  size: 'md',
})

defineEmits<{ 'update:modelValue': [value: string[]] }>()

const {
  labelProps,
  errorMessageProps,
  descriptionProps,
  displayError,
  inputText,
  addTag,
  removeTag,
  fieldValue,
} = useBaseTagsField(props)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addTag(inputText.value)
  }
  if (e.key === 'Backspace' && !inputText.value) {
    const tags = (fieldValue.value as string[] | undefined) ?? []
    if (tags.length > 0) {
      removeTag(tags.length - 1)
    }
  }
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

    <div
      :class="[
        'shaped-border shaped-radius-sm flex min-h-[38px] flex-wrap items-center gap-1 border px-2 py-1.5',
        'dark:bg-surface-800 bg-white',
        displayError
          ? 'border-red-400 dark:border-red-500'
          : 'border-surface-300 dark:border-surface-600 focus-within:ring-primary-300 focus-within:ring-2',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ]"
      data-ui="tags-field"
      :data-provider="provider"
    >
      <span
        v-for="(tag, index) in (fieldValue as string[] | undefined) ?? []"
        :key="index"
        class="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm"
      >
        {{ tag }}
        <button
          type="button"
          class="text-primary-500 hover:text-primary-700 text-xs leading-none"
          :disabled="disabled"
          @click="removeTag(index)"
        >
          ✕
        </button>
      </span>
      <input
        v-model="inputText"
        :placeholder="!(fieldValue as string[] | undefined)?.length ? placeholder : ''"
        :disabled="disabled"
        class="text-surface-700 dark:text-surface-200 placeholder:text-surface-400 min-w-[80px] flex-1 bg-transparent text-sm outline-none"
        @keydown="onKeydown"
      />
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
