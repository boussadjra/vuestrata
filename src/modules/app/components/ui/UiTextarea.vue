<script setup lang="ts">
import { useUiTextarea, type TextareaProps } from '@/composables/forms'

import {
  fieldErrorMessageClass,
  fieldRequiredIndicatorClass,
  invalidTextInputClass,
} from './validationPresentation'

const props = withDefaults(defineProps<TextareaProps>(), {
  rows: 4,
  resize: 'vertical',
  size: 'md',
})

defineEmits<{ 'update:modelValue': [value: string] }>()

const { inputProps, labelProps, errorMessageProps, descriptionProps, displayError } =
  useUiTextarea(props)

const resizeClasses: Record<string, string> = {
  none: 'resize-none',
  vertical: 'resize-y',
  both: 'resize',
}

const classes = computed(() => [
  'w-full rounded-lg border bg-white dark:bg-surface-800 px-3 py-2 text-sm text-foreground transition-colors',
  'placeholder:text-surface-400 dark:placeholder:text-surface-500',
  'focus:outline-none focus:ring-2 focus:ring-offset-0',
  displayError.value
    ? invalidTextInputClass
    : 'border-surface-300 dark:border-surface-600 focus:ring-primary-300 focus:border-primary-400',
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-50 dark:disabled:bg-surface-900',
  resizeClasses[props.resize],
])
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-foreground text-sm font-medium">
      {{ label }}
      <span v-if="required" :class="fieldRequiredIndicatorClass">*</span>
    </label>

    <textarea
      v-bind="inputProps"
      :rows="rows"
      :class="classes"
      data-provider="reka"
      data-ui="textarea"
    />

    <p v-if="displayError" v-bind="errorMessageProps" :class="fieldErrorMessageClass" role="alert">
      {{ displayError }}
    </p>
    <p
      v-else-if="hint || description"
      v-bind="descriptionProps"
      class="text-muted-foreground text-xs"
    >
      {{ hint || description }}
    </p>
  </div>
</template>
