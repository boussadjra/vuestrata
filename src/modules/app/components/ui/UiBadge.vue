<script setup lang="ts">
export interface BadgeProps {
  provider?: 'reka'
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error'
  size?: 'sm' | 'md' | 'lg'
  dot?: boolean
}

const props = withDefaults(defineProps<BadgeProps>(), {
  provider: 'reka',
  variant: 'default',
  size: 'md',
  dot: false,
})

const variantMap: Record<string, string> = {
  default: 'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-300',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
  secondary: 'bg-secondary-100 text-secondary-700 dark:bg-secondary-900/40 dark:text-secondary-300',
  // Status variants use the semantic status ramps rather than raw palette
  // families, so they follow a theme that chooses to override them and pick up
  // the dark-mode flip from styles/semantic.css.
  success: 'bg-success-100 text-success-800 dark:bg-success-900/40 dark:text-success-200',
  warning: 'bg-warning-100 text-warning-800 dark:bg-warning-900/40 dark:text-warning-200',
  error: 'bg-danger-100 text-danger-800 dark:bg-danger-900/40 dark:text-danger-200',
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
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error: 'bg-danger-500',
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
