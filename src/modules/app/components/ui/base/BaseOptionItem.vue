<script setup lang="ts">
import { useBaseOption } from '@/components/ui/base'

const props = defineProps<{
  provider: 'reka' | 'vuetify0'
  label: string
  value: string | number
  disabled?: boolean
}>()

const { optionProps, isSelected } = useBaseOption(props)

const optionClasses = computed(() => [
  'relative flex cursor-pointer items-center px-8 py-2 text-sm select-none',
  props.provider === 'reka' ? 'rounded-md' : 'rounded',
  'text-surface-700 dark:text-surface-200 outline-none',
  'data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-600',
  'dark:data-[highlighted]:bg-primary-900/30 dark:data-[highlighted]:text-primary-400',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
])
</script>

<template>
  <div v-bind="optionProps" :data-provider="provider" :class="optionClasses">
    <span v-if="isSelected" class="text-primary-500 absolute left-2 flex items-center"> ✓ </span>
    <span>{{ label }}</span>
  </div>
</template>
