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
    <label v-if="label" class="text-foreground text-sm font-medium">
      {{ label }}
      <span v-if="required" class="text-destructive ms-0.5">*</span>
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
      <span class="text-muted-foreground text-sm">→</span>
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
    <p v-if="error" class="text-destructive text-xs" role="alert">{{ error }}</p>
    <p v-else-if="hint || description" class="text-muted-foreground text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
