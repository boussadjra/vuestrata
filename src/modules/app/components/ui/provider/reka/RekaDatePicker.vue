<script setup lang="ts">
import type { DateFieldProps } from '@/components/ui/base'
import BaseDatePickerField from '@/components/ui/base/BaseDatePickerField.vue'

import RekaCalendar from './RekaCalendar.vue'

const props = withDefaults(defineProps<DateFieldProps>(), {
  size: 'md',
})

defineEmits<{ 'update:modelValue': [value: Date] }>()
</script>

<template>
  <BaseDatePickerField
    v-bind="props"
    provider="reka"
    mode="date"
    :calendar-component="RekaCalendar"
  />
</template>
