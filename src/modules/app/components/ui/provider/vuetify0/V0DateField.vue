<script setup lang="ts">
import { DateTimeSegment } from '@formwerk/core'

import { useBaseDateField, type DateFieldProps } from '@/components/ui/base'

const props = withDefaults(defineProps<DateFieldProps>(), { size: 'md' })

defineEmits<{ 'update:modelValue': [value: Date] }>()

const {
  controlProps,
  segments,
  labelProps,
  errorMessageProps,
  descriptionProps,
  displayError,
  direction,
} = useBaseDateField(props)
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
      v-bind="controlProps"
      :dir="direction"
      :class="[
        'inline-flex items-center gap-0.5 rounded-lg border px-3 py-2 text-sm',
        'text-surface-700 dark:bg-surface-800 dark:text-surface-200 bg-white',
        displayError
          ? 'border-red-400 dark:border-red-500'
          : 'border-surface-300 dark:border-surface-600 focus-within:ring-primary-300 focus-within:ring-2',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ]"
      data-ui="date-field"
      data-provider="vuetify0"
    >
      <DateTimeSegment v-for="(segment, index) in segments" :key="index" v-bind="segment" />
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
