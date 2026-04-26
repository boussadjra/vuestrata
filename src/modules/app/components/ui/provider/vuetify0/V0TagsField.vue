<script setup lang="ts">
import { useBaseTagsField, type TagsFieldProps } from '@/components/ui/base'

const props = withDefaults(defineProps<TagsFieldProps>(), {
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
    if (tags.length > 0) removeTag(tags.length - 1)
  }
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <div
      class="flex min-h-[38px] flex-wrap items-center gap-1 rounded border px-2 py-1.5"
      data-ui="tags-field"
      data-provider="vuetify0"
    >
      <span
        v-for="(tag, index) in (fieldValue as string[] | undefined) ?? []"
        :key="index"
        class="bg-primary-100 text-primary-700 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm"
      >
        {{ tag }}
        <button type="button" class="text-xs" :disabled="disabled" @click="removeTag(index)">
          ✕
        </button>
      </span>
      <input
        v-model="inputText"
        :placeholder="!(fieldValue as string[] | undefined)?.length ? placeholder : ''"
        :disabled="disabled"
        class="min-w-[80px] flex-1 bg-transparent text-sm outline-none"
        @keydown="onKeydown"
      />
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
