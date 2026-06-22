<script setup lang="ts">
import { DateFieldInput, DateFieldRoot } from 'reka-ui'
import type { DateValue } from 'reka-ui/date'

import { useUiDateField, type DateFieldProps } from '@/composables/forms'

import {
  fromDateValue,
  inferDateGranularity,
  inferHourCycle,
  toDatePlaceholder,
  toDateValue,
} from './dateValue'

const props = withDefaults(defineProps<DateFieldProps>(), {
  size: 'md',
})

const emit = defineEmits<{ 'update:modelValue': [value: Date] }>()

const { fieldValue, setValue, labelProps, errorMessageProps, descriptionProps, displayError } =
  useUiDateField(props)

const granularity = computed(() => inferDateGranularity(props.formatOptions))
const includeTime = computed(() => granularity.value !== 'day')
const hourCycle = computed(() => inferHourCycle(props.formatOptions))

const modelValue = computed(
  () =>
    toDateValue(fieldValue.value, { includeTime: includeTime.value, timeZone: props.timeZone }) ??
    toDateValue(props.modelValue, { includeTime: includeTime.value, timeZone: props.timeZone }),
)

const placeholderValue = computed(
  () =>
    modelValue.value ??
    toDatePlaceholder(props.modelValue, {
      includeTime: includeTime.value,
      timeZone: props.timeZone,
    }),
)

function onValueChange(value: DateValue | undefined) {
  const nextValue = fromDateValue(value, props.timeZone)

  if (!nextValue) return

  setValue(nextValue)
  emit('update:modelValue', nextValue)
}

const segmentClasses =
  'rounded-sm px-0.5 outline-none data-placeholder:text-surface-400 data-disabled:opacity-50'
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

    <DateFieldRoot
      v-slot="{ segments }"
      :model-value="modelValue"
      :placeholder="placeholderValue"
      :locale="locale"
      :disabled="disabled"
      :readonly="readonly"
      :required="required"
      :granularity="granularity"
      :hour-cycle="hourCycle"
      prevent-deselect
      @update:model-value="onValueChange"
    >
      <div
        :class="[
          'inline-flex items-center gap-0.5 rounded-lg border px-3 py-2 text-sm',
          'text-surface-700 dark:bg-surface-800 dark:text-surface-200 bg-white',
          displayError
            ? 'border-red-400 dark:border-red-500'
            : 'border-surface-300 dark:border-surface-600 focus-within:ring-primary-300 focus-within:ring-2',
          disabled ? 'cursor-not-allowed opacity-50' : '',
        ]"
        data-ui="date-field"
        data-provider="reka"
      >
        <DateFieldInput
          v-for="(segment, index) in segments"
          :key="`${segment.part}-${index}`"
          :part="segment.part"
          :class="segmentClasses"
        >
          {{ segment.value }}
        </DateFieldInput>
      </div>
    </DateFieldRoot>

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
