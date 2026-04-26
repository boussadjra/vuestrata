<script setup lang="ts">
import {
  useBaseToggleGroup,
  type ToggleGroupProps,
  type ToggleGroupOption,
} from '@/components/ui/base'

const props = withDefaults(defineProps<ToggleGroupProps>(), {
  multiple: false,
  size: 'md',
})

const emit = defineEmits<{ 'update:modelValue': [value: string | string[]] }>()

const { isSelected, toggleValue } = useBaseToggleGroup(props, emit)

const sizeClasses: Record<string, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-base',
}

function itemClasses(option: ToggleGroupOption) {
  return [
    'inline-flex items-center justify-center font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    'first:rounded-l-md last:rounded-r-md border-y border-r first:border-l',
    isSelected(option.value)
      ? 'bg-primary-500 border-primary-500 text-white'
      : 'bg-white dark:bg-surface-800 border-surface-300 dark:border-surface-600 text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700',
    option.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
    sizeClasses[props.size],
  ]
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" class="text-surface-700 dark:text-surface-300 text-sm font-medium">
      {{ label }}
    </label>
    <div class="inline-flex" role="group" data-provider="reka" data-ui="togglegroup">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        :class="itemClasses(option)"
        :disabled="option.disabled || disabled"
        :aria-pressed="isSelected(option.value)"
        @click="toggleValue(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
    <p v-if="error" class="text-xs text-red-500" role="alert">
      {{ error }}
    </p>
  </div>
</template>
