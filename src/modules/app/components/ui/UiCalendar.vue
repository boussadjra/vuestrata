<script setup lang="ts">
import {
  CalendarCell,
  CalendarCellTrigger,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHead,
  CalendarGridRow,
  CalendarHeader,
  CalendarHeadCell,
  CalendarHeading,
  CalendarNext,
  CalendarPrev,
  CalendarRoot,
} from 'reka-ui'
import type { DateValue } from 'reka-ui/date'

import type { FieldProps } from '@/types'

import { fromDateValue, toDatePlaceholder, toDateValue } from './dateValue'

export interface CalendarProps extends Omit<FieldProps, 'size'> {
  modelValue?: Date
  locale?: string
  calendar?: string
  timeZone?: string
  min?: string
  max?: string
}

const props = defineProps<CalendarProps>()
const emit = defineEmits<{ 'update:modelValue': [value: Date] }>()

const modelValue = computed(() => toDateValue(props.modelValue, { timeZone: props.timeZone }))
const placeholderValue = computed(
  () => modelValue.value ?? toDatePlaceholder(props.modelValue, { timeZone: props.timeZone }),
)

const minValue = computed(() => {
  if (!props.min) return undefined

  const parsed = new Date(props.min)
  return toDateValue(parsed, { timeZone: props.timeZone })
})

const maxValue = computed(() => {
  if (!props.max) return undefined

  const parsed = new Date(props.max)
  return toDateValue(parsed, { timeZone: props.timeZone })
})

function onValueChange(value: DateValue | DateValue[] | undefined) {
  const selected = Array.isArray(value) ? value[0] : value
  const nextValue = fromDateValue(selected, props.timeZone)

  if (nextValue) emit('update:modelValue', nextValue)
}
</script>

<template>
  <CalendarRoot
    v-slot="{ grid, weekDays }"
    :model-value="modelValue"
    :placeholder="placeholderValue"
    :locale="locale"
    :disabled="disabled"
    :readonly="readonly"
    :min-value="minValue"
    :max-value="maxValue"
    prevent-deselect
    @update:model-value="onValueChange"
  >
    <div
      class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 inline-block rounded-lg border bg-white p-3"
      data-ui="calendar"
      data-provider="reka"
    >
      <CalendarHeader class="mb-2 flex items-center justify-between gap-3">
        <CalendarPrev
          class="hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-400 rounded p-1"
        >
          ←
        </CalendarPrev>
        <CalendarHeading class="text-surface-700 dark:text-surface-300 text-sm font-medium" />
        <CalendarNext
          class="hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-400 rounded p-1"
        >
          →
        </CalendarNext>
      </CalendarHeader>

      <div class="flex flex-col gap-4">
        <CalendarGrid
          v-for="month in grid"
          :key="month.value.toString()"
          class="w-full border-collapse"
        >
          <CalendarGridHead>
            <CalendarGridRow>
              <CalendarHeadCell
                v-for="weekDay in weekDays"
                :key="weekDay"
                class="text-surface-400 px-1 py-1 text-center text-xs font-medium"
              >
                {{ weekDay }}
              </CalendarHeadCell>
            </CalendarGridRow>
          </CalendarGridHead>

          <CalendarGridBody>
            <CalendarGridRow
              v-for="(week, weekIndex) in month.rows"
              :key="`${month.value}-${weekIndex}`"
            >
              <CalendarCell v-for="date in week" :key="date.toString()" :date="date" class="p-0.5">
                <CalendarCellTrigger
                  v-slot="{ dayValue }"
                  :day="date"
                  :month="month.value"
                  class="data-selected:bg-primary-700 data-today:border-primary-500 data-today:text-primary-700 dark:data-today:text-primary-300 data-outside-view:text-surface-300 dark:data-outside-view:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm outline-none data-disabled:cursor-not-allowed data-disabled:opacity-40 data-selected:text-white data-today:border"
                >
                  {{ dayValue }}
                </CalendarCellTrigger>
              </CalendarCell>
            </CalendarGridRow>
          </CalendarGridBody>
        </CalendarGrid>
      </div>
    </div>
  </CalendarRoot>
</template>
