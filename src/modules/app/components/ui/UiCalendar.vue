<script setup lang="ts">
import { useUiCalendar, type CalendarProps } from '@/composables/forms'

const props = defineProps<CalendarProps>()
defineEmits<{ 'update:modelValue': [value: Date] }>()

const {
  calendarProps,
  gridProps,
  currentView,
  setView,
  gridLabelProps,
  gridLabel,
  nextButtonProps,
  previousButtonProps,
} = useUiCalendar(props)

const weekDays = computed(() =>
  currentView.value.type === 'weeks' ? currentView.value.weekDays : [],
)
const days = computed(() => (currentView.value.type === 'weeks' ? currentView.value.days : []))
const months = computed(() => (currentView.value.type === 'months' ? currentView.value.months : []))
const years = computed(() => (currentView.value.type === 'years' ? currentView.value.years : []))
</script>

<template>
  <div
    v-bind="calendarProps"
    class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 inline-block rounded-lg border bg-white p-3"
    data-ui="calendar"
    data-provider="reka"
  >
    <div class="mb-2 flex items-center justify-between">
      <button
        v-bind="previousButtonProps"
        class="hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-400 rounded p-1"
      >
        ←
      </button>
      <span
        v-bind="gridLabelProps"
        class="text-surface-700 dark:text-surface-300 text-sm font-medium"
      >
        {{ gridLabel }}
      </span>
      <button
        v-bind="nextButtonProps"
        class="hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-400 rounded p-1"
      >
        →
      </button>
    </div>

    <!-- Weeks view -->
    <template v-if="currentView.type === 'weeks'">
      <div v-bind="gridProps" class="grid grid-cols-7 gap-0.5">
        <div
          v-for="wd in weekDays"
          :key="wd"
          class="text-surface-400 py-1 text-center text-xs font-medium"
        >
          {{ wd }}
        </div>
        <button
          v-for="day in days"
          :key="day.label"
          type="button"
          class="h-8 w-8 rounded-full text-sm"
          :class="{
            'bg-primary-700 text-white': day.selected,
            'border-primary-500 text-primary-700 dark:text-primary-300 border':
              day.isToday && !day.selected,
            'text-surface-300 dark:text-surface-600': day.isOutsideMonth,
            'cursor-not-allowed opacity-40': day.disabled,
            'hover:bg-surface-100 dark:hover:bg-surface-700': !day.selected && !day.disabled,
          }"
          :disabled="day.disabled"
        >
          {{ day.dayOfMonth }}
        </button>
      </div>
    </template>

    <!-- Months view -->
    <template v-else-if="currentView.type === 'months'">
      <div v-bind="gridProps" class="grid grid-cols-3 gap-1">
        <button
          v-for="month in months"
          :key="month.label"
          type="button"
          class="rounded px-2 py-2 text-sm"
          :class="{
            'bg-primary-700 text-white': month.selected,
            'hover:bg-surface-100 dark:hover:bg-surface-700': !month.selected,
            'cursor-not-allowed opacity-40': month.disabled,
          }"
          :disabled="month.disabled"
        >
          {{ month.label }}
        </button>
      </div>
    </template>

    <!-- Years view -->
    <template v-else-if="currentView.type === 'years'">
      <div v-bind="gridProps" class="grid grid-cols-3 gap-1">
        <button
          v-for="yr in years"
          :key="yr.label"
          type="button"
          class="rounded px-2 py-2 text-sm"
          :class="{
            'bg-primary-700 text-white': yr.selected,
            'hover:bg-surface-100 dark:hover:bg-surface-700': !yr.selected,
            'cursor-not-allowed opacity-40': yr.disabled,
          }"
          :disabled="yr.disabled"
        >
          {{ yr.label }}
        </button>
      </div>
    </template>
  </div>
</template>
