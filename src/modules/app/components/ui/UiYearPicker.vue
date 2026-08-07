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

export interface YearPickerProps extends DateFieldProps {}

const props = withDefaults(defineProps<YearPickerProps>(), { size: 'md' })

const emit = defineEmits<{
  'update:modelValue': [value: Date]
}>()

const { t } = useI18n()

const { labelProps, errorMessageProps, descriptionProps, displayError, fieldValue, setValue } =
  useUiDateField({
    label: props.label,
    name: props.name,
    disabled: props.disabled,
    readonly: props.readonly,
    modelValue: props.modelValue,
    locale: props.locale,
    formatOptions: { year: 'numeric' },
  })

const currentDate = computed(() => {
  const value = fieldValue.value instanceof Date ? fieldValue.value : props.modelValue
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date()
})

const currentDecadeStart = computed(() => {
  const y = currentDate.value.getFullYear()
  return y - (y % 10)
})

const years = computed(() => Array.from({ length: 12 }, (_, i) => currentDecadeStart.value - 1 + i))

const selectedYearValue = computed(() => String(currentDate.value.getFullYear()))

function onValueChange(value: string | number | Array<string | number>) {
  const rawValue = Array.isArray(value) ? value[0] : value
  const year = Number(rawValue)

  if (Number.isNaN(year)) return

  const nextDate = new Date(currentDate.value)
  nextDate.setFullYear(year)
  setValue(nextDate)
  emit('update:modelValue', nextDate)
}

const shownError = computed(() => displayError.value || props.error)

const triggerClasses = computed(() => [
  'shaped-border shaped-radius-sm inline-flex w-full items-center justify-between border px-3 py-2 text-sm',
  'bg-white text-surface-700 dark:bg-surface-800 dark:text-surface-200',
  shownError.value
    ? 'border-destructive focus:ring-danger-300'
    : 'border-surface-300 dark:border-surface-600 focus:ring-primary-300',
  'focus:ring-2 focus:outline-none',
  props.disabled ? 'cursor-not-allowed opacity-50' : '',
])

const optionClasses =
  'relative flex cursor-pointer items-center rounded-md px-8 py-2 text-sm text-surface-700 outline-none select-none dark:text-surface-200 data-highlighted:bg-primary-50 data-highlighted:text-primary-600 dark:data-highlighted:bg-primary-900/30 dark:data-highlighted:text-primary-400 data-disabled:pointer-events-none data-disabled:opacity-40'
</script>

<template>
  <div class="flex flex-col gap-1" data-provider="reka">
    <label v-if="label" v-bind="labelProps" class="text-foreground text-sm font-medium">
      {{ label }}
    </label>
    <SelectRoot
      :model-value="selectedYearValue"
      :disabled="disabled"
      @update:model-value="onValueChange"
    >
      <SelectTrigger :class="triggerClasses" data-ui="year-picker">
        <span class="truncate">{{
          modelValue ? modelValue.getFullYear() : t('common_select_year')
        }}</span>
        <SelectIcon class="text-muted-foreground ms-2 text-xs">▼</SelectIcon>
      </SelectTrigger>

      <SelectPortal>
        <SelectContent
          class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 z-50 mt-1 w-48 rounded-md border bg-white p-2 shadow-lg"
          position="popper"
          :side-offset="4"
        >
          <SelectViewport>
            <div class="grid grid-cols-3 gap-1">
              <SelectItem
                v-for="year in years"
                :key="year"
                :value="String(year)"
                :class="optionClasses"
              >
                <SelectItemIndicator class="text-primary-500 absolute start-2 flex items-center"
                  >✓</SelectItemIndicator
                >
                <SelectItemText
                  :class="{
                    'text-muted-foreground':
                      year < currentDecadeStart || year > currentDecadeStart + 9,
                  }"
                >
                  {{ year }}
                </SelectItemText>
              </SelectItem>
            </div>
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
    <p v-if="shownError" v-bind="errorMessageProps" class="text-destructive text-xs" role="alert">
      {{ shownError }}
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
