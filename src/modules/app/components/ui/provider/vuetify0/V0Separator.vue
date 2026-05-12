<script setup lang="ts">
import BaseSeparator from '@/components/ui/base/BaseSeparator.vue'

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
}

withDefaults(defineProps<SeparatorProps>(), {
  orientation: 'horizontal',
  decorative: true,
})
</script>

<template>
  <BaseSeparator v-bind="$props" provider="vuetify0" />
</template>
