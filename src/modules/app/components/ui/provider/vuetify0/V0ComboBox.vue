<script setup lang="ts">
import { useBaseComboBox, type ComboBoxProps } from '@/components/ui/base'

import V0Option from './V0Option.vue'

const props = withDefaults(defineProps<ComboBoxProps>(), {
  placeholder: 'Search...',
  size: 'md',
})

defineEmits<{ 'update:modelValue': [value: string | string[]] }>()

const {
  inputProps,
  triggerProps,
  listBoxProps,
  labelProps,
  errorMessageProps,
  descriptionProps,
  displayError,
  isOpen,
} = useBaseComboBox(props)

const inputClasses = computed(() => [
  'w-full rounded-lg border bg-white text-surface-700 dark:bg-surface-800 dark:text-surface-200 transition-colors',
  'placeholder:text-surface-400 dark:placeholder:text-surface-500',
  'focus:outline-none focus:ring-2 focus:ring-offset-0',
  displayError.value
    ? 'border-red-400 focus:ring-red-300 dark:border-red-500'
    : 'border-surface-300 dark:border-surface-600 focus:ring-primary-300 focus:border-primary-400',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  'px-3 py-2 text-sm',
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
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>

    <div class="relative">
      <div class="flex">
        <input
          v-bind="inputProps"
          :placeholder="placeholder"
          :class="inputClasses"
          data-ui="combobox"
          data-provider="vuetify0"
        />
        <button
          v-bind="triggerProps"
          type="button"
          class="text-surface-400 absolute top-1/2 right-2 -translate-y-1/2 text-xs"
        >
          ▼
        </button>
      </div>

      <div
        v-show="isOpen"
        v-bind="listBoxProps"
        class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 shadow-elevated absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white p-1"
      >
        <V0Option
          v-for="option in options"
          :key="option.value"
          :label="option.label"
          :value="option.value"
          :disabled="option.disabled"
        />
      </div>
    </div>

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
