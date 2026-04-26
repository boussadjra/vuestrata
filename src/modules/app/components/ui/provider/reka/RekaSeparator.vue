<script setup lang="ts">
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
  <div
    :class="[
      'bg-surface-200 dark:bg-surface-700 shrink-0',
      orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full',
    ]"
    role="separator"
    :aria-orientation="orientation"
    :aria-hidden="decorative"
    data-ui="separator"
    data-provider="reka"
  />
</template>
