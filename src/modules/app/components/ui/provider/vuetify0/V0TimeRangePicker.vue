<script setup lang="ts">
import { type TimeFieldProps } from '@/components/ui/base'

import V0TimeField from './V0TimeField.vue'

export interface TimeRangePickerProps extends Omit<TimeFieldProps, 'modelValue'> {
  start?: string
  end?: string
}

const props = withDefaults(defineProps<TimeRangePickerProps>(), { size: 'md' })

const emit = defineEmits<{
  'update:start': [value: string]
  'update:end': [value: string]
}>()
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" class="text-sm font-medium">{{ label }}</label>
    <div class="flex items-center gap-2" data-provider="vuetify0" data-ui="time-range-picker">
      <V0TimeField
        :model-value="start"
        :disabled="disabled"
        :readonly="readonly"
        @update:model-value="emit('update:start', $event)"
      />
      <span class="text-surface-400 text-sm">→</span>
      <V0TimeField
        :model-value="end"
        :disabled="disabled"
        :readonly="readonly"
        @update:model-value="emit('update:end', $event)"
      />
    </div>
    <p v-if="error" class="text-xs text-red-500" role="alert">{{ error }}</p>
    <p v-else-if="hint || description" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
