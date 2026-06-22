<script setup lang="ts">
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxRoot,
  ComboboxTrigger,
  ComboboxViewport,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'

import { useUiComboBox, type ComboBoxProps } from '@/composables/forms'

const props = withDefaults(defineProps<ComboBoxProps>(), {
  size: 'md',
})

const emit = defineEmits<{ 'update:modelValue': [value: string | string[]] }>()
const { t } = useI18n()

const { labelProps, errorMessageProps, descriptionProps, displayError, fieldValue, setValue } =
  useUiComboBox(props)

const placeholderText = computed(() => props.placeholder ?? t('common_search'))

const isMultiple = computed(
  () => Array.isArray(props.modelValue) || Array.isArray(fieldValue.value),
)

const selectedValue = computed(() => {
  if (isMultiple.value)
    return Array.isArray(fieldValue.value)
      ? fieldValue.value
      : Array.isArray(props.modelValue)
        ? props.modelValue
        : []

  if (Array.isArray(fieldValue.value)) return fieldValue.value[0] ?? ''

  return fieldValue.value ?? props.modelValue ?? ''
})

const selectedOptions = computed(() => {
  const selectedValues = Array.isArray(selectedValue.value)
    ? selectedValue.value
    : selectedValue.value
      ? [selectedValue.value]
      : []

  return props.options.filter((option) => selectedValues.includes(option.value))
})

const searchTerm = ref('')

function displayValue(value: string | undefined) {
  if (!value) return ''

  return props.options.find((option) => option.value === value)?.label ?? value
}

function onValueChange(value: string | string[]) {
  setValue(value)
  emit('update:modelValue', value)
}

const inputClasses = computed(() => [
  'min-w-[96px] flex-1 bg-transparent text-surface-700 transition-colors outline-none dark:text-surface-200',
  'placeholder:text-surface-400 dark:placeholder:text-surface-500',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'text-sm',
])

const anchorClasses = computed(() => [
  'shaped-border shaped-radius-sm flex w-full flex-wrap items-center gap-1 border px-3 py-2 text-sm',
  'bg-white dark:bg-surface-800',
  displayError.value
    ? 'border-red-400 dark:border-red-500 focus-within:ring-red-300'
    : 'border-surface-300 dark:border-surface-600 focus-within:ring-primary-300',
  'focus-within:ring-2',
  props.disabled ? 'cursor-not-allowed opacity-50' : '',
])

const optionClasses = computed(() => [
  'relative flex items-center rounded-md px-8 py-2 text-sm text-surface-700 outline-none select-none dark:text-surface-200',
  'data-highlighted:bg-primary-50 data-highlighted:text-primary-600',
  'dark:data-highlighted:bg-primary-900/30 dark:data-highlighted:text-primary-400',
  'data-disabled:pointer-events-none data-disabled:opacity-40',
])

const chipClasses =
  'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 inline-flex items-center rounded-full px-2 py-0.5 text-xs'
</script>

<template>
  <div class="flex flex-col gap-1">
    <label
      v-if="label"
      v-bind="labelProps"
      class="text-surface-700 dark:text-surface-300 text-sm font-medium"
    >
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>

    <ComboboxRoot
      :model-value="selectedValue"
      :multiple="isMultiple"
      :disabled="disabled"
      :required="required"
      :name="name"
      :open-on-focus="openOnFocus"
      open-on-click
      @update:model-value="onValueChange"
    >
      <ComboboxAnchor :class="anchorClasses">
        <template v-if="isMultiple">
          <span v-for="option in selectedOptions" :key="option.value" :class="chipClasses">
            {{ option.label }}
          </span>
        </template>

        <ComboboxInput
          v-model="searchTerm"
          :display-value="isMultiple ? undefined : displayValue"
          :placeholder="placeholderText"
          :class="inputClasses"
          data-ui="combobox"
          data-provider="reka"
        />
        <ComboboxTrigger
          type="button"
          class="text-surface-400 ml-auto inline-flex h-4 w-4 items-center justify-center text-xs"
        >
          ▼
        </ComboboxTrigger>
      </ComboboxAnchor>

      <ComboboxContent
        force-mount
        class="shaped-border shaped-radius shaped-shadow border-surface-200 dark:border-surface-700 dark:bg-surface-800 z-50 mt-1 max-h-60 w-full overflow-auto border bg-white p-1"
      >
        <ComboboxViewport>
          <ComboboxEmpty class="text-surface-500 dark:text-surface-400 px-3 py-2 text-sm">
            {{ t('common_no_results') }}
          </ComboboxEmpty>

          <ComboboxItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            :text-value="option.label"
            :disabled="option.disabled"
            :class="optionClasses"
          >
            <ComboboxItemIndicator class="text-primary-500 absolute left-2 flex items-center">
              ✓
            </ComboboxItemIndicator>
            <span class="truncate">{{ option.label }}</span>
          </ComboboxItem>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxRoot>

    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p
      v-else-if="hint || description"
      v-bind="descriptionProps"
      class="text-surface-500 dark:text-surface-400 text-xs"
    >
      {{ hint || description }}
    </p>
  </div>
</template>
