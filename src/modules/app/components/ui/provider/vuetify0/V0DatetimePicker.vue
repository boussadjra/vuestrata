<script setup lang="ts">
import type { DateFieldProps } from '@/components/ui/base'
import BaseDatePickerField from '@/components/ui/base/BaseDatePickerField.vue'

import V0Calendar from './V0Calendar.vue'

export interface DatetimePickerProps extends DateFieldProps {
  hour12?: boolean
}

const props = withDefaults(defineProps<DatetimePickerProps>(), {
  size: 'md',
  formatOptions: () => ({
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }),
})

defineEmits<{ 'update:modelValue': [value: Date] }>()
</script>

<template>
  <BaseDatePickerField
    v-bind="props"
    provider="vuetify0"
    mode="datetime"
    :calendar-component="V0Calendar"
  />
</template>
