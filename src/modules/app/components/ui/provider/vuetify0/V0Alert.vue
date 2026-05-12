<script setup lang="ts">
import BaseAlert from '@/components/ui/base/BaseAlert.vue'

export interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'error'
  title?: string
  dismissible?: boolean
  icon?: boolean
}

defineProps<AlertProps>()
</script>

<template>
  <BaseAlert v-bind="$props" provider="vuetify0" @dismiss="$emit('dismiss')">
    <slot />
  </BaseAlert>
</template>
