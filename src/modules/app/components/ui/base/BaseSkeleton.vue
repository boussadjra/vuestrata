<script setup lang="ts">
export interface BaseSkeletonProps {
  provider: 'reka' | 'vuetify0'
  width?: string
  height?: string
  rounded?: 'sm' | 'md' | 'lg' | 'full'
  animated?: boolean
}

const props = withDefaults(defineProps<BaseSkeletonProps>(), {
  width: '100%',
  height: '1rem',
  rounded: 'md',
  animated: true,
})

const radiusClasses: Record<string, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
}

const classes = computed(() => [
  'bg-surface-200 dark:bg-surface-700',
  radiusClasses[props.rounded],
  props.animated ? 'animate-pulse' : '',
])
</script>

<template>
  <div
    :class="classes"
    :style="{ width, height }"
    role="status"
    aria-live="polite"
    aria-label="Loading"
    data-ui="skeleton"
    :data-provider="provider"
  />
</template>
