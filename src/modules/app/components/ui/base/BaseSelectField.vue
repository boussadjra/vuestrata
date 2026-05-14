<script setup lang="ts">
import type { Component } from 'vue'

import { useBaseSelect, type SelectProps } from '@/components/ui/base'

import {
  fieldErrorMessageClass,
  fieldRequiredIndicatorClass,
  invalidSelectTriggerClass,
} from './validationPresentation'

const props = withDefaults(
  defineProps<
    SelectProps & {
      provider: 'reka' | 'vuetify0'
      optionComponent: Component
      optionGroupComponent: Component
    }
  >(),
  {
    placeholder: 'Select...',
    size: 'md',
  },
)

defineEmits<{ 'update:modelValue': [value: string | string[]] }>()

const {
  triggerProps,
  listBoxProps,
  labelProps,
  errorMessageProps,
  descriptionProps,
  displayError,
  isOpen,
  selectedOption,
} = useBaseSelect(props)

function isGroup(
  opt: (typeof props.options)[number],
): opt is { label: string; options: { label: string; value: string; disabled?: boolean }[] } {
  return 'options' in opt
}

const triggerClasses = computed(() => [
  'inline-flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm',
  'bg-white text-surface-700 dark:bg-surface-800 dark:text-surface-200',
  displayError.value ? invalidSelectTriggerClass : 'border-surface-300 dark:border-surface-600',
  'hover:border-surface-400 dark:hover:border-surface-500',
  'focus:outline-none focus:ring-2 focus:ring-primary-300',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'min-w-45',
])
</script>

<template>
  <div class="flex flex-col gap-1">
    <label
      v-if="label"
      v-bind="labelProps"
      class="text-surface-700 dark:text-surface-300 text-sm font-medium"
    >
      {{ label }}
      <span v-if="required" :class="fieldRequiredIndicatorClass">*</span>
    </label>

    <div class="relative">
      <button
        v-bind="triggerProps"
        type="button"
        :class="triggerClasses"
        :data-provider="provider"
        data-ui="select"
      >
        <span v-if="selectedOption" class="truncate">{{ selectedOption.label }}</span>
        <span v-else class="text-surface-400 truncate">{{ placeholder }}</span>
        <span class="text-surface-400 ml-2 text-xs">▼</span>
      </button>

      <div
        v-show="isOpen"
        v-bind="listBoxProps"
        class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 shadow-elevated absolute z-50 mt-1 w-auto min-w-45 overflow-hidden rounded-lg border bg-white p-1"
      >
        <template v-for="option in options" :key="'value' in option ? option.value : option.label">
          <component :is="optionGroupComponent" v-if="isGroup(option)" :label="option.label">
            <component
              :is="optionComponent"
              v-for="child in option.options"
              :key="child.value"
              :label="child.label"
              :value="child.value"
              :disabled="child.disabled"
            />
          </component>
          <component
            :is="optionComponent"
            v-else
            :label="option.label"
            :value="option.value"
            :disabled="option.disabled"
          />
        </template>
      </div>
    </div>

    <p v-if="displayError" v-bind="errorMessageProps" :class="fieldErrorMessageClass" role="alert">
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
