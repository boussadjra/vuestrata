<script setup lang="ts">
import { DateTimeSegment, usePicker } from '@formwerk/core'
import type { Component } from 'vue'

import { useBaseDateField, type DateFieldProps } from '@/components/ui/base'

export interface BaseDatePickerFieldProps extends DateFieldProps {
  provider: 'reka' | 'vuetify0'
  mode?: 'date' | 'datetime'
  calendarComponent: Component
  pickerLabel?: string
  hour12?: boolean
}

const props = withDefaults(defineProps<BaseDatePickerFieldProps>(), {
  size: 'md',
  mode: 'date',
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
  calendarProps,
} = useBaseDateField(props)

const { isOpen, pickerProps, pickerTriggerProps } = usePicker({
  label: () =>
    props.label ??
    props.pickerLabel ??
    (props.mode === 'datetime' ? 'Pick date and time' : 'Pick date'),
  disabled: () => props.disabled,
})

const controlClasses = computed(() => [
  props.mode === 'datetime'
    ? 'inline-flex flex-1 flex-wrap items-center gap-0.5 rounded-lg border px-3 py-2 text-sm'
    : 'inline-flex flex-1 items-center gap-0.5 rounded-lg border px-3 py-2 text-sm',
  'text-surface-700 dark:bg-surface-800 dark:text-surface-200 bg-white',
  displayError.value
    ? 'border-red-400 dark:border-red-500'
    : 'border-surface-300 dark:border-surface-600 focus-within:ring-primary-300 focus-within:ring-2',
  props.disabled ? 'cursor-not-allowed opacity-50' : '',
])

const dataUi = computed(() => (props.mode === 'datetime' ? 'datetime-picker' : 'date-picker'))
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
          :class="controlClasses"
          :data-ui="dataUi"
          :data-provider="provider"
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

      <div v-if="isOpen" v-bind="pickerProps" class="absolute z-50 mt-1">
        <component :is="calendarComponent" v-bind="calendarProps as Record<string, unknown>" />
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
