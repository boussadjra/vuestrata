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
  const map: Record<string, { panel: string; icon: string }> = {
    info: {
      panel:
        'border-primary-200/80 bg-primary-50/70 dark:border-primary-800/60 dark:bg-primary-950/20',
      icon: 'i-solar-info-circle-bold text-primary-600 dark:text-primary-300',
    },
    success: {
      panel: 'border-accent-200/80 bg-accent-50/70 dark:border-accent-800/60 dark:bg-accent-950/20',
      icon: 'i-solar-check-circle-bold text-accent-600 dark:text-accent-300',
    },
    warning: {
      panel:
        'border-secondary-200/80 bg-secondary-50/70 dark:border-secondary-800/60 dark:bg-secondary-950/20',
      icon: 'i-solar-danger-triangle-bold text-secondary-700 dark:text-secondary-300',
    },
    error: {
      panel: 'border-danger-200/80 bg-danger-50/70 dark:border-danger-800/60 dark:bg-danger-950/20',
      icon: 'i-solar-close-circle-bold text-danger-600 dark:text-danger-300',
    },
  }
  return map[props.type]!
})
</script>

<template>
  <div
    :class="[
      'text-surface-700 dark:text-surface-200 my-4 flex items-start gap-3 rounded-lg border p-4',
      styles.panel,
    ]"
    role="note"
  >
    <span :class="[styles.icon, 'mt-0.5 h-5 w-5 shrink-0']" aria-hidden="true" />
    <div class="min-w-0 flex-1 text-sm">
      <slot />
    </div>
  </div>
</template>
