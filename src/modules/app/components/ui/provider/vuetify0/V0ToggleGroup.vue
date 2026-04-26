<script setup lang="ts">
import { useBaseToggleGroup, type ToggleGroupProps } from '@/components/ui/base'

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
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" class="text-sm font-medium">
      {{ label }}
    </label>
    <div class="inline-flex" role="group" data-provider="vuetify0" data-ui="togglegroup">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        :class="[
          'inline-flex items-center justify-center font-medium transition-colors',
          'border-y border-r first:rounded-l-md first:border-l last:rounded-r-md',
          isSelected(option.value)
            ? 'bg-primary-500 border-primary-500 text-white'
            : 'border-surface-300 text-surface-700 hover:bg-surface-50 bg-white',
          option.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          sizeClasses[size],
        ]"
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
