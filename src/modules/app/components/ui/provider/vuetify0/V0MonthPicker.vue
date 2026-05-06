<script setup lang="ts">
import { DateTimeSegment, usePicker } from '@formwerk/core'

import { useBaseDateField, type DateFieldProps } from '@/components/ui/base'

const props = withDefaults(defineProps<DateFieldProps>(), {
  size: 'md',
  formatOptions: () => ({ year: 'numeric', month: 'long' }),
})

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
const { isOpen, pickerProps, pickerTriggerProps } = usePicker({
  label: () => props.label ?? 'Pick month',
  disabled: () => props.disabled,
})

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
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

    <div class="relative">
      <div class="flex items-center gap-1">
        <div
          v-bind="controlProps"
          :dir="direction"
          :class="[
            'inline-flex flex-1 items-center gap-0.5 rounded-lg border px-3 py-2 text-sm',
            'text-surface-700 dark:bg-surface-800 dark:text-surface-200 bg-white',
            displayError
              ? 'border-red-400 dark:border-red-500'
              : 'border-surface-300 dark:border-surface-600 focus-within:ring-primary-300 focus-within:ring-2',
          ]"
          data-ui="month-picker"
          data-provider="vuetify0"
        >
          <DateTimeSegment v-for="(segment, index) in segments" :key="index" v-bind="segment" />
        </div>
        <button
          v-bind="pickerTriggerProps"
          type="button"
          class="border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 rounded-lg border p-2"
        >
          📅
        </button>
      </div>

      <div
        v-if="isOpen"
        v-bind="pickerProps"
        class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 shadow-elevated absolute z-50 mt-1 rounded-lg border bg-white p-3"
      >
        <div class="grid grid-cols-3 gap-1">
          <button
            v-for="month in months"
            :key="month"
            type="button"
            class="hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-300 rounded-md px-3 py-2 text-sm"
          >
            {{ month }}
          </button>
        </div>
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
