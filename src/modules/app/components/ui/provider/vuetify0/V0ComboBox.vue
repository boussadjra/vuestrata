<script setup lang="ts">
import { useOption } from '@formwerk/core'

import { useBaseComboBox, type ComboBoxProps } from '@/components/ui/base'

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
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <div class="relative">
      <input
        v-bind="inputProps"
        :placeholder="placeholder"
        class="w-full rounded border px-3 py-2 text-sm"
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
      <div
        v-show="isOpen"
        v-bind="listBoxProps"
        class="dark:bg-surface-800 absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded border bg-white p-1 shadow"
      >
        <div
          v-for="option in options"
          :key="option.value"
          class="hover:bg-surface-100 dark:hover:bg-surface-700 cursor-pointer px-3 py-1.5 text-sm"
        >
          {{ option.label }}
        </div>
      </div>
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
