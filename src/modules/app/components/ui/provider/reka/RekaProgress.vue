<script setup lang="ts">
import BaseProgressField from '@/components/ui/base/BaseProgressField.vue'

export interface ProgressProps {
  value?: number
  max?: number
  label?: string
  showValue?: boolean
  size?: 'sm' | 'md' | 'lg'
}

defineProps<ProgressProps>()
</script>

<template>
  <BaseProgressField v-bind="$props" provider="reka" />
</template>
