<script setup lang="ts">
import { type TimeFieldProps } from '@/composables/forms'

import RekaTimeField from './UiTimeField.vue'

export interface TimeRangePickerProps extends Omit<TimeFieldProps, 'modelValue'> {
  start?: string
  end?: string
}

const props = withDefaults(defineProps<TimeRangePickerProps>(), {
  size: 'md',
})

const emit = defineEmits<{
  'update:start': [value: string]
  'update:end': [value: string]
}>()
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" class="text-surface-700 dark:text-surface-300 text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <div class="flex items-center gap-2" data-provider="reka" data-ui="time-range-picker">
      <RekaTimeField
        :model-value="start"
        :label="undefined"
        :disabled="disabled"
        :readonly="readonly"
        :locale="locale"
        placeholder="Start time"
        @update:model-value="emit('update:start', $event)"
      />
      <span class="text-surface-400 text-sm">→</span>
      <RekaTimeField
        :model-value="end"
        :label="undefined"
        :disabled="disabled"
        :readonly="readonly"
        :locale="locale"
        placeholder="End time"
        @update:model-value="emit('update:end', $event)"
      />
    </div>
    <p v-if="error" class="text-xs text-red-500" role="alert">{{ error }}</p>
    <p v-else-if="hint || description" class="text-surface-500 dark:text-surface-400 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
