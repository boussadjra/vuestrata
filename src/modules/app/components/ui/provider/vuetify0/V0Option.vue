<script setup lang="ts">
import { useOption } from '@formwerk/core'

const props = defineProps<{
  label: string
  value: string
  disabled?: boolean
}>()

const { optionProps, isSelected } = useOption({
  label: () => props.label,
  value: () => props.value,
  disabled: () => props.disabled,
})
</script>

<template>
  <div
    v-bind="optionProps"
    data-provider="vuetify0"
    :class="[
      'relative flex cursor-pointer items-center rounded px-8 py-2 text-sm select-none',
      'text-surface-700 dark:text-surface-200 outline-none',
      'data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-600',
      'dark:data-[highlighted]:bg-primary-900/30 dark:data-[highlighted]:text-primary-400',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
    ]"
  >
    <span v-if="isSelected" class="text-primary-500 absolute left-2 flex items-center"> ✓ </span>
    <span>{{ label }}</span>
  </div>
</template>
