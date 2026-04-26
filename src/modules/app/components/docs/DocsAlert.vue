<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    type?: 'info' | 'warning' | 'success' | 'error'
  }>(),
  {
    type: 'info',
  },
)

const styles = computed(() => {
  const map: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    info: {
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-200 dark:border-blue-800',
      text: 'text-blue-800 dark:text-blue-200',
      icon: 'i-solar-info-circle-bold text-blue-500',
    },
    success: {
      bg: 'bg-green-50 dark:bg-green-950/30',
      border: 'border-green-200 dark:border-green-800',
      text: 'text-green-800 dark:text-green-200',
      icon: 'i-solar-check-circle-bold text-green-500',
    },
    warning: {
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      border: 'border-amber-200 dark:border-amber-800',
      text: 'text-amber-800 dark:text-amber-200',
      icon: 'i-solar-danger-triangle-bold text-amber-500',
    },
    error: {
      bg: 'bg-red-50 dark:bg-red-950/30',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-800 dark:text-red-200',
      icon: 'i-solar-close-circle-bold text-red-500',
    },
  }
  return map[props.type]!
})
</script>

<template>
  <div
    :class="[
      'my-4 flex items-start gap-3 rounded-lg border p-4',
      styles.bg,
      styles.border,
      styles.text,
    ]"
    role="alert"
  >
    <span :class="[styles.icon, 'mt-0.5 h-5 w-5 shrink-0']" aria-hidden="true" />
    <div class="min-w-0 flex-1 text-sm">
      <slot />
    </div>
  </div>
</template>
