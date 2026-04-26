<script setup lang="ts">
import { useBaseTextarea, type TextareaProps } from '@/components/ui/base'

const props = withDefaults(defineProps<TextareaProps>(), {
  rows: 4,
  resize: 'vertical',
  size: 'md',
})

defineEmits<{ 'update:modelValue': [value: string] }>()

const { inputProps, labelProps, errorMessageProps, descriptionProps, displayError } =
  useBaseTextarea(props)

const resizeClasses: Record<string, string> = {
  none: 'resize-none',
  vertical: 'resize-y',
  both: 'resize',
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <textarea
      v-bind="inputProps"
      :rows="rows"
      :class="[
        'w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none',
        resizeClasses[resize],
      ]"
      data-ui="textarea"
      data-provider="vuetify0"
    />
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
