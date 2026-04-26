<script setup lang="ts">
import { DateTimeSegment, usePicker } from '@formwerk/core'

import { useBaseDateField, type DateFieldProps } from '@/components/ui/base'

const props = withDefaults(defineProps<DateFieldProps>(), { size: 'md' })

defineEmits<{ 'update:modelValue': [value: Date] }>()

const { controlProps, segments, labelProps, errorMessageProps, descriptionProps, displayError } =
  useBaseDateField({
    ...props,
    formatOptions: {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    },
  })
const { isOpen, pickerProps, pickerTriggerProps } = usePicker({
  label: props.label ?? '',
  disabled: () => props.disabled,
})
</script>

<template>
  <div class="flex flex-col gap-1" data-provider="vuetify0">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <div class="relative">
      <div class="flex items-center gap-1 rounded border px-3 py-2 text-sm" v-bind="controlProps">
        <DateTimeSegment v-for="seg in segments" :key="seg.type" v-bind="seg" />
        <button v-bind="pickerTriggerProps" type="button" class="text-surface-400 ml-auto text-xs">
          📅
        </button>
      </div>
      <div
        v-if="isOpen"
        v-bind="pickerProps"
        class="dark:bg-surface-800 absolute z-50 mt-1 rounded border bg-white p-2 shadow"
      >
        <p class="text-surface-400 text-xs">Datetime popup (V0 stub)</p>
      </div>
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
