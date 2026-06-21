<script setup lang="ts">
export interface BaseBadgeProps {
  provider: 'reka'
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error'
  size?: 'sm' | 'md' | 'lg'
  dot?: boolean
}

const props = withDefaults(defineProps<BaseBadgeProps>(), {
  variant: 'default',
  size: 'md',
  dot: false,
})

const variantMap: Record<string, string> = {
  default: 'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-300',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
  secondary: 'bg-secondary-100 text-secondary-700 dark:bg-secondary-900/40 dark:text-secondary-300',
  success: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

const sizeMap: Record<string, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
}

const dotColorMap: Record<string, string> = {
  default: 'bg-surface-500',
  primary: 'bg-primary-500',
  secondary: 'bg-secondary-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
}

const classes = computed(() => [
  'inline-flex items-center gap-1.5 rounded-full font-medium',
  variantMap[props.variant],
  sizeMap[props.size],
])
</script>

<template>
  <span :class="classes" :data-provider="provider" data-ui="badge">
    <span v-if="dot" :class="['h-1.5 w-1.5 rounded-full', dotColorMap[variant]]" />
    <slot />
  </span>
</template>
