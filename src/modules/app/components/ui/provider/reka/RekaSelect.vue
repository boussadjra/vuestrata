<script setup lang="ts">
import { useBaseSelect, type SelectProps } from '@/components/ui/base'

import RekaOption from './RekaOption.vue'
import RekaOptionGroup from './RekaOptionGroup.vue'

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

const triggerClasses = computed(() => [
  'inline-flex items-center justify-between rounded-lg border px-3 py-2 text-sm w-full',
  'bg-white text-surface-700 dark:bg-surface-800 dark:text-surface-200',
  displayError.value
    ? 'border-red-400 focus:ring-red-300 dark:border-red-500'
    : 'border-surface-300 dark:border-surface-600',
  'hover:border-surface-400 dark:hover:border-surface-500',
  'focus:outline-none focus:ring-2 focus:ring-primary-300',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  'min-w-[180px]',
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
      <button
        v-bind="triggerProps"
        type="button"
        :class="triggerClasses"
        data-provider="reka"
        data-ui="select"
      >
        <span v-if="selectedOption" class="truncate">{{ selectedOption.label }}</span>
        <span v-else class="text-surface-400 truncate">{{ placeholder }}</span>
        <span class="text-surface-400 ml-2 text-xs">▼</span>
      </button>

      <div
        v-show="isOpen"
        v-bind="listBoxProps"
        class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 shadow-elevated absolute z-50 mt-1 w-full min-w-[180px] overflow-hidden rounded-lg border bg-white p-1"
      >
        <template v-for="option in options" :key="'value' in option ? option.value : option.label">
          <RekaOptionGroup v-if="isGroup(option)" :label="option.label">
            <RekaOption
              v-for="child in option.options"
              :key="child.value"
              :label="child.label"
              :value="child.value"
              :disabled="child.disabled"
            />
          </RekaOptionGroup>
          <RekaOption
            v-else
            :label="option.label"
            :value="option.value"
            :disabled="option.disabled"
          />
        </template>
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
