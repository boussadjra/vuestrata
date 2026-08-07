<script setup lang="ts">
import { DateTimeSegment } from '@formwerk/core'

import { useUiTimeField, type TimeFieldProps } from '@/composables/forms'

const props = withDefaults(defineProps<TimeFieldProps>(), {
  size: 'md',
})

defineEmits<{ 'update:modelValue': [value: string] }>()

const {
  controlProps,
  segments,
  labelProps,
  errorMessageProps,
  descriptionProps,
  displayError,
  direction,
} = useUiTimeField(props)
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-foreground text-sm font-medium">
      {{ label }}
      <span v-if="required" class="text-destructive ms-0.5">*</span>
    </label>

    <div
      v-bind="controlProps"
      :dir="direction"
      :class="[
        'shaped-border shaped-radius-sm inline-flex items-center gap-0.5 border px-3 py-2 text-sm',
        'text-surface-700 dark:bg-surface-800 dark:text-surface-200 bg-white',
        displayError
          ? 'border-destructive'
          : 'border-surface-300 dark:border-surface-600 focus-within:ring-primary-300 focus-within:ring-2',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ]"
      data-ui="time-field"
      data-provider="reka"
    >
      <DateTimeSegment v-for="(segment, index) in segments" :key="index" v-bind="segment" />
    </div>

    <p v-if="displayError" v-bind="errorMessageProps" class="text-destructive text-xs" role="alert">
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
