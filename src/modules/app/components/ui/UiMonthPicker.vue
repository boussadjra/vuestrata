<script setup lang="ts">
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectViewport,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'

import { useUiDateField, type DateFieldProps } from '@/composables/forms'

const props = withDefaults(defineProps<DateFieldProps>(), {
  size: 'md',
  formatOptions: () => ({ year: 'numeric', month: 'long' }),
})

const emit = defineEmits<{ 'update:modelValue': [value: Date] }>()

const { t } = useI18n()

const { fieldValue, setValue, labelProps, errorMessageProps, descriptionProps, displayError } =
  useUiDateField(props)

const currentDate = computed(() => {
  const value = fieldValue.value instanceof Date ? fieldValue.value : props.modelValue
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date()
})

const monthOptions = computed(() => {
  const formatter = new Intl.DateTimeFormat(props.locale || undefined, { month: 'long' })

  return Array.from({ length: 12 }, (_, index) => ({
    value: String(index),
    label: formatter.format(new Date(2026, index, 1)),
  }))
})

const selectedMonthValue = computed(() => String(currentDate.value.getMonth()))
const selectedMonthLabel = computed(
  () =>
    monthOptions.value.find((option) => option.value === selectedMonthValue.value)?.label ??
    t('common_select'),
)

function onValueChange(value: string | number | Array<string | number>) {
  const monthValue = Array.isArray(value) ? value[0] : value
  const monthIndex = Number(monthValue)

  if (Number.isNaN(monthIndex)) return

  const nextDate = new Date(currentDate.value)
  nextDate.setMonth(monthIndex)
  setValue(nextDate)
  emit('update:modelValue', nextDate)
}

const triggerClasses = computed(() => [
  'shaped-border shaped-radius-sm inline-flex w-full items-center justify-between border px-3 py-2 text-sm',
  'bg-white text-surface-700 dark:bg-surface-800 dark:text-surface-200',
  displayError.value
    ? 'border-destructive focus:ring-danger-300'
    : 'border-surface-300 dark:border-surface-600 focus:ring-primary-300',
  'focus:ring-2 focus:outline-none',
  props.disabled ? 'cursor-not-allowed opacity-50' : '',
])

const optionClasses =
  'relative flex cursor-pointer items-center rounded-md px-8 py-2 text-sm text-surface-700 outline-none select-none dark:text-surface-200 data-highlighted:bg-primary-50 data-highlighted:text-primary-600 dark:data-highlighted:bg-primary-900/30 dark:data-highlighted:text-primary-400 data-disabled:pointer-events-none data-disabled:opacity-40'
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-foreground text-sm font-medium">
      {{ label }}
      <span v-if="required" class="text-destructive ms-0.5">*</span>
    </label>

    <SelectRoot
      :model-value="selectedMonthValue"
      :disabled="disabled"
      @update:model-value="onValueChange"
    >
      <SelectTrigger :class="triggerClasses" data-ui="month-picker" data-provider="reka">
        <span class="truncate">{{ selectedMonthLabel }}</span>
        <SelectIcon class="text-muted-foreground ms-2 text-xs">▼</SelectIcon>
      </SelectTrigger>

      <SelectPortal>
        <SelectContent
          class="shaped-border shaped-radius shaped-shadow border-surface-200 dark:border-surface-700 dark:bg-surface-800 z-50 min-w-45 overflow-hidden border bg-white p-1"
          position="popper"
          :side-offset="4"
        >
          <SelectViewport>
            <SelectItem
              v-for="month in monthOptions"
              :key="month.value"
              :value="month.value"
              :class="optionClasses"
            >
              <SelectItemIndicator class="text-primary-500 absolute start-2 flex items-center"
                >✓</SelectItemIndicator
              >
              <SelectItemText>{{ month.label }}</SelectItemText>
            </SelectItem>
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>

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
