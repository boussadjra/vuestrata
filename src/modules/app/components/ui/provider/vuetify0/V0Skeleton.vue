<script setup lang="ts">
import BaseSkeleton from '@/components/ui/base/BaseSkeleton.vue'

export interface SkeletonProps {
  width?: string
  height?: string
  rounded?: 'sm' | 'md' | 'lg' | 'full'
  animated?: boolean
}

withDefaults(defineProps<SkeletonProps>(), {
  width: '100%',
  height: '1rem',
  rounded: 'md',
  animated: true,
})
</script>

<template>
  <BaseSkeleton v-bind="$props" provider="vuetify0" />
</template>
