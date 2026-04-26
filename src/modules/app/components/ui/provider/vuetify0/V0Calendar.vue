<script setup lang="ts">
import { useBaseCalendar, type CalendarProps } from '@/components/ui/base'

const props = withDefaults(defineProps<CalendarProps>(), {})

defineEmits<{ 'update:modelValue': [value: Date] }>()

const { calendarProps, gridProps, gridLabelProps, selectedDate, focusedDate } =
  useBaseCalendar(props)
</script>

<template>
  <div
    v-bind="calendarProps"
    class="rounded border p-3"
    data-provider="vuetify0"
    data-ui="calendar"
  >
    <div class="mb-2 flex items-center justify-between">
      <span v-bind="gridLabelProps" class="text-sm font-medium">Calendar</span>
    </div>
    <div v-bind="gridProps" class="grid grid-cols-7 gap-1 text-center text-sm">
      <span class="text-surface-400 py-1 text-xs font-medium">S</span>
      <span class="text-surface-400 py-1 text-xs font-medium">M</span>
      <span class="text-surface-400 py-1 text-xs font-medium">T</span>
      <span class="text-surface-400 py-1 text-xs font-medium">W</span>
      <span class="text-surface-400 py-1 text-xs font-medium">T</span>
      <span class="text-surface-400 py-1 text-xs font-medium">F</span>
      <span class="text-surface-400 py-1 text-xs font-medium">S</span>
    </div>
  </div>
</template>
