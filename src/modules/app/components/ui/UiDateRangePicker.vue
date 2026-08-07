<script setup lang="ts">
import { type DateFieldProps } from '@/composables/forms'

import RekaDatePicker from './UiDatePicker.vue'

export interface DateRangePickerProps extends Omit<DateFieldProps, 'modelValue'> {
  start?: Date
  end?: Date
}

const props = withDefaults(defineProps<DateRangePickerProps>(), {
  size: 'md',
})

const emit = defineEmits<{
  'update:start': [value: Date]
  'update:end': [value: Date]
}>()
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" class="text-foreground text-sm font-medium">
      {{ label }}
      <span v-if="required" class="text-destructive ms-0.5">*</span>
    </label>
    <div class="flex items-center gap-2" data-provider="reka" data-ui="date-range-picker">
      <RekaDatePicker
        :model-value="start"
        :label="undefined"
        :disabled="disabled"
        :readonly="readonly"
        :locale="locale"
        placeholder="Start date"
        @update:model-value="emit('update:start', $event)"
      />
      <span class="text-muted-foreground text-sm">→</span>
      <RekaDatePicker
        :model-value="end"
        :label="undefined"
        :disabled="disabled"
        :readonly="readonly"
        :locale="locale"
        placeholder="End date"
        @update:model-value="emit('update:end', $event)"
      />
    </div>
    <p v-if="error" class="text-destructive text-xs" role="alert">{{ error }}</p>
    <p v-else-if="hint || description" class="text-muted-foreground text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
