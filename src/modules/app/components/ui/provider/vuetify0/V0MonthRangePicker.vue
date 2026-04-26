<script setup lang="ts">
import { type DateFieldProps } from '@/components/ui/base'

import V0MonthPicker from './V0MonthPicker.vue'

export interface MonthRangePickerProps extends Omit<DateFieldProps, 'modelValue'> {
  start?: Date
  end?: Date
}

const props = withDefaults(defineProps<MonthRangePickerProps>(), { size: 'md' })

const emit = defineEmits<{
  'update:start': [value: Date]
  'update:end': [value: Date]
}>()
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" class="text-sm font-medium">{{ label }}</label>
    <div class="flex items-center gap-2" data-provider="vuetify0" data-ui="month-range-picker">
      <V0MonthPicker
        :model-value="start"
        :disabled="disabled"
        :readonly="readonly"
        @update:model-value="emit('update:start', $event)"
      />
      <span class="text-surface-400 text-sm">→</span>
      <V0MonthPicker
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
