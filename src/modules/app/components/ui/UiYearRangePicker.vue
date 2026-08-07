<script setup lang="ts">
import { type DateFieldProps } from '@/composables/forms'

import RekaYearPicker from './UiYearPicker.vue'

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
    <label v-if="label" class="text-foreground text-sm font-medium">{{ label }}</label>
    <div class="flex items-center gap-2" data-provider="reka" data-ui="year-range-picker">
      <RekaYearPicker
        :model-value="start"
        :disabled="disabled"
        :readonly="readonly"
        :locale="locale"
        @update:model-value="emit('update:start', $event)"
      />
      <span class="text-muted-foreground text-sm">→</span>
      <RekaYearPicker
        :model-value="end"
        :disabled="disabled"
        :readonly="readonly"
        :locale="locale"
        @update:model-value="emit('update:end', $event)"
      />
    </div>
    <p v-if="error" class="text-destructive text-xs" role="alert">{{ error }}</p>
    <p v-else-if="hint || description" class="text-muted-foreground text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
