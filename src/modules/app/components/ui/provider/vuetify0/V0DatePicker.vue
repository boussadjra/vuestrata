<script setup lang="ts">
import type { DateFieldProps } from '@/components/ui/base'
import BaseDatePickerField from '@/components/ui/base/BaseDatePickerField.vue'

import V0Calendar from './V0Calendar.vue'

const props = withDefaults(defineProps<DateFieldProps>(), { size: 'md' })

defineEmits<{ 'update:modelValue': [value: Date] }>()
</script>

<template>
  <BaseDatePickerField
    v-bind="props"
    provider="vuetify0"
    mode="date"
    :calendar-component="V0Calendar"
  />
</template>
