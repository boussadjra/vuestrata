<script setup lang="ts">
import BaseBadge from '@/components/ui/base/BaseBadge.vue'

export interface BadgeProps {
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error'
  size?: 'sm' | 'md' | 'lg'
  dot?: boolean
}

defineProps<BadgeProps>()
</script>

<template>
  <BaseBadge v-bind="$props" provider="reka">
    <slot />
  </BaseBadge>
</template>
