<script setup lang="ts">
import { Progress } from '@vuetify/v0'

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
  <BaseProgressField
    v-bind="$props"
    provider="vuetify0"
    :root-component="Progress.Root"
    :track-component="Progress.Track"
    :fill-component="Progress.Fill"
  />
</template>
