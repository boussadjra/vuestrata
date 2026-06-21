<script setup lang="ts">
import BaseToastButton from '@/components/ui/base/BaseToastButton.vue'

export interface ToastProps {
  title?: string
  message: string
  variant?: 'info' | 'success' | 'warning' | 'error'
  duration?: number
  triggerLabel?: string
}

defineProps<ToastProps>()
</script>

<template>
  <BaseToastButton v-bind="$props" provider="reka" />
</template>
