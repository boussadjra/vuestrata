<script setup lang="ts">
import { SelectItem, SelectItemIndicator, SelectItemText } from 'reka-ui'

const props = defineProps<{
  label: string
  value: string | number
  disabled?: boolean
}>()

const optionClasses = computed(() => [
  'relative flex cursor-pointer items-center rounded-md px-8 py-2 text-sm text-surface-700 outline-none select-none dark:text-surface-200',
  'data-highlighted:bg-primary-50 data-highlighted:text-primary-600',
  'dark:data-highlighted:bg-primary-900/30 dark:data-highlighted:text-primary-400',
  'data-disabled:pointer-events-none data-disabled:opacity-40',
])
</script>

<template>
  <SelectItem :value="value" :disabled="disabled" data-provider="reka" :class="optionClasses">
    <SelectItemIndicator class="text-primary-500 absolute start-2 flex items-center"
      >✓</SelectItemIndicator
    >
    <SelectItemText>{{ label }}</SelectItemText>
  </SelectItem>
</template>
