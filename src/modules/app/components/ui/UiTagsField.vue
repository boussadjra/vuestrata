<script setup lang="ts">
import {
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
  TagsInputRoot,
} from 'reka-ui'

import { useUiTagsField, type TagsFieldProps } from '@/composables/forms'

const props = withDefaults(defineProps<TagsFieldProps & { provider?: 'reka' }>(), {
  provider: 'reka',
  size: 'md',
})

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const { labelProps, errorMessageProps, descriptionProps, displayError, fieldValue, setValue } =
  useUiTagsField(props)

const { t } = useI18n()

const tagsValue = computed(() =>
  Array.isArray(fieldValue.value) ? fieldValue.value : (props.modelValue ?? []),
)

const tagsPlaceholder = computed(() => props.placeholder ?? `${t('common_add_item')}...`)

function onValueChange(value: string[]) {
  setValue(value)
  emit('update:modelValue', value)
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

    <TagsInputRoot
      :model-value="tagsValue"
      :name="name"
      :required="required"
      :disabled="disabled"
      :duplicate="allowDuplicates"
      :max="maxTags ?? 0"
      class="shaped-border shaped-radius-sm flex min-h-9.5 flex-wrap items-center gap-1 border px-2 py-1.5"
      :class="[
        'dark:bg-surface-800 bg-white',
        displayError
          ? 'border-red-400 dark:border-red-500'
          : 'border-surface-300 dark:border-surface-600 focus-within:ring-primary-300 focus-within:ring-2',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ]"
      data-ui="tags-field"
      :data-provider="provider"
      @update:model-value="onValueChange"
    >
      <TagsInputItem
        v-for="(tag, index) in tagsValue"
        :key="`${tag}-${index}`"
        :value="tag"
        class="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm"
      >
        <TagsInputItemText />
        <TagsInputItemDelete
          class="text-primary-500 hover:text-primary-700 text-xs leading-none"
          :disabled="disabled"
        >
          ✕
        </TagsInputItemDelete>
      </TagsInputItem>
      <TagsInputInput
        :placeholder="!tagsValue.length ? tagsPlaceholder : ''"
        class="text-surface-700 dark:text-surface-200 placeholder:text-surface-400 min-w-20 flex-1 bg-transparent text-sm outline-none"
      />
    </TagsInputRoot>

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
