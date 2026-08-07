<script setup lang="ts">
import {
  DatePickerCalendar,
  DatePickerCell,
  DatePickerCellTrigger,
  DatePickerContent,
  DatePickerField,
  DatePickerGrid,
  DatePickerGridBody,
  DatePickerGridHead,
  DatePickerGridRow,
  DatePickerHeadCell,
  DatePickerHeader,
  DatePickerHeading,
  DatePickerInput,
  DatePickerNext,
  DatePickerPrev,
  DatePickerRoot,
  DatePickerTrigger,
} from 'reka-ui'
import type { DateValue } from 'reka-ui/date'
import { useI18n } from 'vue-i18n'

import { useUiDateField, type DateFieldProps } from '@/composables/forms'
import {
  fromDateValue,
  inferDateGranularity,
  inferHourCycle,
  toDatePlaceholder,
  toDateValue,
} from '@/utils/dateValue'

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

const emit = defineEmits<{ 'update:modelValue': [value: Date] }>()
const { t } = useI18n()

const { labelProps, errorMessageProps, descriptionProps, displayError, fieldValue, setValue } =
  useUiDateField(props)

const granularity = computed(() => inferDateGranularity(props.formatOptions))
const includeTime = computed(() => granularity.value !== 'day')
const hourCycle = computed(() => inferHourCycle(props.formatOptions))

const modelValue = computed(
  () =>
    toDateValue(fieldValue.value, { includeTime: includeTime.value, timeZone: props.timeZone }) ??
    toDateValue(props.modelValue, { includeTime: includeTime.value, timeZone: props.timeZone }),
)

const placeholderValue = computed(
  () =>
    modelValue.value ??
    toDatePlaceholder(props.modelValue, {
      includeTime: includeTime.value,
      timeZone: props.timeZone,
    }),
)

function onValueChange(value: DateValue | undefined) {
  const nextValue = fromDateValue(value, props.timeZone)

  if (!nextValue) return

  setValue(nextValue)
  emit('update:modelValue', nextValue)
}

const controlClasses = computed(() => [
  'shaped-border shaped-radius-sm inline-flex flex-1 flex-wrap items-center gap-0.5 border px-3 py-2 text-sm',
  'text-surface-700 dark:bg-surface-800 dark:text-surface-200 bg-white',
  displayError.value
    ? 'border-destructive'
    : 'border-surface-300 dark:border-surface-600 focus-within:ring-primary-300 focus-within:ring-2',
  props.disabled ? 'cursor-not-allowed opacity-50' : '',
])

const segmentClasses =
  'rounded-sm px-0.5 outline-none data-placeholder:text-surface-400 data-disabled:opacity-50'
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-foreground text-sm font-medium">
      {{ label }}
      <span v-if="required" class="text-destructive ms-0.5">*</span>
    </label>

    <DatePickerRoot
      :model-value="modelValue"
      :placeholder="placeholderValue"
      :locale="locale"
      :disabled="disabled"
      :readonly="readonly"
      :required="required"
      :granularity="granularity"
      :hour-cycle="hourCycle"
      close-on-select
      prevent-deselect
      @update:model-value="onValueChange"
    >
      <DatePickerField v-slot="{ segments }" class="flex items-center gap-1">
        <div :class="controlClasses" data-ui="datetime-picker" data-provider="reka">
          <DatePickerInput
            v-for="(segment, index) in segments"
            :key="`${segment.part}-${index}`"
            :part="segment.part"
            :class="segmentClasses"
          >
            {{ segment.value }}
          </DatePickerInput>
        </div>
        <DatePickerTrigger
          class="shaped-border shaped-radius-sm border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-500 border p-2"
          :aria-label="props.label ?? t('common_pick_datetime')"
        >
          📅
        </DatePickerTrigger>
      </DatePickerField>

      <DatePickerContent
        class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 shaped-radius shaped-shadow z-50 mt-1 rounded-lg border bg-white p-3"
        :side-offset="6"
      >
        <DatePickerCalendar v-slot="{ weekDays, grid }">
          <DatePickerHeader class="mb-2 flex items-center justify-between gap-3">
            <DatePickerPrev
              class="hover:bg-surface-100 dark:hover:bg-surface-700 text-muted-foreground rounded p-1"
            >
              ←
            </DatePickerPrev>
            <DatePickerHeading class="text-foreground text-sm font-medium" />
            <DatePickerNext
              class="hover:bg-surface-100 dark:hover:bg-surface-700 text-muted-foreground rounded p-1"
            >
              →
            </DatePickerNext>
          </DatePickerHeader>

          <div class="flex flex-col gap-4">
            <DatePickerGrid
              v-for="month in grid"
              :key="month.value.toString()"
              class="w-full border-collapse"
            >
              <DatePickerGridHead>
                <DatePickerGridRow>
                  <DatePickerHeadCell
                    v-for="weekDay in weekDays"
                    :key="weekDay"
                    class="text-muted-foreground px-1 py-1 text-center text-xs font-medium"
                  >
                    {{ weekDay }}
                  </DatePickerHeadCell>
                </DatePickerGridRow>
              </DatePickerGridHead>

              <DatePickerGridBody>
                <DatePickerGridRow
                  v-for="(week, weekIndex) in month.rows"
                  :key="`${month.value}-${weekIndex}`"
                >
                  <DatePickerCell
                    v-for="date in week"
                    :key="date.toString()"
                    :date="date"
                    class="p-0.5"
                  >
                    <DatePickerCellTrigger
                      v-slot="{ dayValue }"
                      :day="date"
                      :month="month.value"
                      class="data-selected:bg-primary-700 data-today:border-primary-500 data-today:text-primary-700 dark:data-today:text-primary-300 data-outside-view:text-surface-300 dark:data-outside-view:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm outline-none data-disabled:cursor-not-allowed data-disabled:opacity-40 data-selected:text-white data-today:border"
                    >
                      {{ dayValue }}
                    </DatePickerCellTrigger>
                  </DatePickerCell>
                </DatePickerGridRow>
              </DatePickerGridBody>
            </DatePickerGrid>
          </div>
        </DatePickerCalendar>
      </DatePickerContent>
    </DatePickerRoot>

    <p v-if="displayError" v-bind="errorMessageProps" class="text-destructive text-xs" role="alert">
      {{ displayError }}
    </p>
    <p
      v-else-if="hint || description"
      v-bind="descriptionProps"
      class="text-muted-foreground text-xs"
    >
      {{ hint || description }}
    </p>
  </div>
</template>
