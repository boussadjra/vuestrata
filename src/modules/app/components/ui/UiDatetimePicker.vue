<script setup lang="ts">
import { DateTimeSegment, usePicker } from '@formwerk/core'
import { useI18n } from 'vue-i18n'

import { useUiDateField, type DateFieldProps } from '@/composables/forms'

import UiCalendar from './UiCalendar.vue'

export interface DatetimePickerProps extends DateFieldProps {
  hour12?: boolean
}

const props = withDefaults(defineProps<DatetimePickerProps>(), {
  size: 'md',
  formatOptions: () => ({
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }),
})

const emit = defineEmits<{ 'update:modelValue': [value: Date] }>()
const { t } = useI18n()

const {
  controlProps,
  segments,
  labelProps,
  errorMessageProps,
  descriptionProps,
  displayError,
  direction,
  calendarProps,
  fieldValue,
} = useUiDateField(props)

const { isOpen, pickerProps, pickerTriggerProps } = usePicker({
  label: () => props.label ?? t('common_pick_datetime'),
  disabled: () => props.disabled,
})

watch(
  () => fieldValue.value,
  (newValue) => {
    if (newValue !== undefined && newValue !== props.modelValue) {
      emit('update:modelValue', newValue)
    }
  },
)

const controlClasses = computed(() => [
  'shaped-border shaped-radius-sm inline-flex flex-1 flex-wrap items-center gap-0.5 border px-3 py-2 text-sm',
  'text-surface-700 dark:bg-surface-800 dark:text-surface-200 bg-white',
  displayError.value
    ? 'border-red-400 dark:border-red-500'
    : 'border-surface-300 dark:border-surface-600 focus-within:ring-primary-300 focus-within:ring-2',
  props.disabled ? 'cursor-not-allowed opacity-50' : '',
])
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
          data-ui="datetime-picker"
          data-provider="reka"
        >
          <DateTimeSegment v-for="(segment, index) in segments" :key="index" v-bind="segment" />
        </div>
        <button
          v-bind="pickerTriggerProps"
          type="button"
          class="shaped-border shaped-radius-sm border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 border p-2"
        >
          📅
        </button>
      </div>

      <div v-if="isOpen" v-bind="pickerProps" class="absolute z-50 mt-1">
        <UiCalendar v-bind="calendarProps as Record<string, unknown>" />
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
