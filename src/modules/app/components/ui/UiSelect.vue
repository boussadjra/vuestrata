<script setup lang="ts">
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'

import { useUiSelect, type SelectProps } from '@/composables/forms'

import UiOption from './UiOption.vue'
import UiOptionGroup from './UiOptionGroup.vue'
import {
  fieldErrorMessageClass,
  fieldRequiredIndicatorClass,
  invalidSelectTriggerClass,
} from './validationPresentation'

const props = defineProps<SelectProps>()

defineOptions({
  inheritAttrs: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number | Array<string | number>]
}>()

const attrs = useAttrs()
const { t } = useI18n()
const formwerk = useUiSelect(props)

const {
  triggerProps,
  listBoxProps,
  labelProps,
  errorMessageProps,
  descriptionProps,
  displayError,
  isOpen,
  selectedOption,
} = formwerk

const placeholderText = computed(() => props.placeholder ?? t('common_select'))
const controlId = computed(() => props.id ?? formwerk.controlId)
const errorId = computed(() => (controlId.value ? `${controlId.value}-e` : undefined))
const descriptionId = computed(() => (controlId.value ? `${controlId.value}-d` : undefined))

const enhancedLabelProps = computed(() => ({ ...labelProps.value, for: controlId.value }))

const enhancedErrorMessageProps = computed(() => {
  if (!errorId.value) return errorMessageProps.value
  return { ...errorMessageProps.value, id: errorId.value }
})

const enhancedDescriptionProps = computed(() => {
  if (!descriptionId.value) return descriptionProps.value
  return { ...descriptionProps.value, id: descriptionId.value }
})

const enhancedTriggerProps = computed(() => ({
  ...triggerProps.value,
  ...Object.fromEntries(
    Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style'),
  ),
  id: controlId.value,
  'aria-errormessage': displayError.value ? errorId.value : undefined,
  'aria-describedby':
    !displayError.value && (props.hint || props.description) ? descriptionId.value : undefined,
}))

watch(
  () => formwerk.fieldValue.value,
  (newValue) => {
    if (newValue !== undefined && newValue !== props.modelValue) {
      emit('update:modelValue', newValue as string | number | Array<string | number>)
    }
  },
)

function isGroup(
  opt: (typeof props.options)[number],
): opt is { label: string; options: { label: string; value: string; disabled?: boolean }[] } {
  return 'options' in opt
}

function isSingleOption(
  opt: (typeof props.options)[number],
): opt is { label: string; value: string | number; disabled?: boolean } {
  return 'value' in opt
}

const triggerClasses = computed(() => [
  'shaped-border shaped-radius-sm inline-flex w-full items-center justify-between border px-3 py-2 text-sm',
  'bg-white text-surface-700 dark:bg-surface-800 dark:text-surface-200',
  displayError.value ? invalidSelectTriggerClass : 'border-surface-300 dark:border-surface-600',
  'hover:border-surface-400 dark:hover:border-surface-500',
  'focus:outline-none focus:ring-2 focus:ring-primary-300',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'min-w-45',
])
</script>

<template>
  <div class="flex flex-col gap-1" :class="attrs.class" :style="attrs.style">
    <label
      v-if="label"
      v-bind="enhancedLabelProps"
      class="text-surface-700 dark:text-surface-300 text-sm font-medium"
    >
      {{ label }}
      <span v-if="required" :class="fieldRequiredIndicatorClass">*</span>
    </label>

    <div class="relative">
      <button
        v-bind="enhancedTriggerProps"
        type="button"
        :class="triggerClasses"
        data-provider="reka"
        data-ui="select"
      >
        <span v-if="selectedOption" class="truncate">{{ selectedOption.label }}</span>
        <span v-else class="text-surface-400 truncate">{{ placeholderText }}</span>
        <span class="text-surface-400 ml-2 text-xs">▼</span>
      </button>

      <div
        v-show="isOpen"
        v-bind="listBoxProps"
        class="shaped-border shaped-radius shaped-shadow border-surface-200 dark:border-surface-700 dark:bg-surface-800 absolute z-50 mt-1 w-auto min-w-45 overflow-hidden border bg-white p-1"
      >
        <template v-for="option in options" :key="'value' in option ? option.value : option.label">
          <UiOptionGroup v-if="isGroup(option)" :label="option.label">
            <UiOption
              v-for="child in option.options"
              :key="child.value"
              :label="child.label"
              :value="child.value"
              :disabled="child.disabled"
            />
          </UiOptionGroup>
          <UiOption
            v-else-if="isSingleOption(option)"
            :label="option.label"
            :value="option.value"
            :disabled="option.disabled"
          />
        </template>
      </div>
    </div>

    <p
      v-if="displayError"
      v-bind="enhancedErrorMessageProps"
      :class="fieldErrorMessageClass"
      role="alert"
    >
      {{ displayError }}
    </p>
    <p
      v-else-if="hint || description"
      v-bind="enhancedDescriptionProps"
      class="text-surface-500 dark:text-surface-400 text-xs"
    >
      {{ hint || description }}
    </p>
  </div>
</template>
