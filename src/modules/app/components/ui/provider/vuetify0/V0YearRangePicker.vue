<script setup lang="ts">
import { type DateFieldProps } from '@/components/ui/base'

import V0YearPicker from './V0YearPicker.vue'

export interface YearRangePickerProps extends Omit<DateFieldProps, 'modelValue'> {
  start?: Date
  end?: Date
}

const props = withDefaults(defineProps<YearRangePickerProps>(), { size: 'md' })

const emit = defineEmits<{
  'update:start': [value: Date]
  'update:end': [value: Date]
}>()
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" class="text-sm font-medium">{{ label }}</label>
    <div class="flex items-center gap-2" data-provider="vuetify0" data-ui="year-range-picker">
      <V0YearPicker
        :model-value="start"
        :disabled="disabled"
        :readonly="readonly"
        @update:model-value="emit('update:start', $event)"
      />
      <span class="text-surface-400 text-sm">→</span>
      <V0YearPicker
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
