<script setup lang="ts">
import { useOption } from '@formwerk/core'

import { useBaseSelect, type SelectProps } from '@/components/ui/base'

const props = withDefaults(defineProps<SelectProps>(), {
  placeholder: 'Select...',
  size: 'md',
})

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
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <div class="relative">
      <button
        v-bind="triggerProps"
        type="button"
        class="w-full rounded border px-3 py-2 text-left text-sm"
        data-ui="select"
        data-provider="vuetify0"
      >
        <span v-if="selectedOption">{{ selectedOption.label }}</span>
        <span v-else class="text-surface-400">{{ placeholder }}</span>
      </button>
      <div
        v-show="isOpen"
        v-bind="listBoxProps"
        class="dark:bg-surface-800 absolute z-50 mt-1 w-full rounded border bg-white p-1 shadow"
      >
        <template v-for="option in options" :key="'value' in option ? option.value : option.label">
          <template v-if="isGroup(option)">
            <div class="text-surface-400 px-3 py-1 text-xs font-semibold uppercase">
              {{ option.label }}
            </div>
            <div
              v-for="child in option.options"
              :key="child.value"
              class="hover:bg-surface-100 dark:hover:bg-surface-700 cursor-pointer px-3 py-1.5 text-sm"
            >
              {{ child.label }}
            </div>
          </template>
          <div
            v-else
            class="hover:bg-surface-100 dark:hover:bg-surface-700 cursor-pointer px-3 py-1.5 text-sm"
          >
            {{ option.label }}
          </div>
        </template>
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
