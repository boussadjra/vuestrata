<script setup lang="ts">
import { Separator } from 'reka-ui'

export interface SeparatorProps {
  provider?: 'reka'
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
}

withDefaults(defineProps<SeparatorProps>(), {
  provider: 'reka',
  orientation: 'horizontal',
  decorative: true,
})
</script>

<template>
  <Separator
    :class="[
      'bg-surface-200 dark:bg-surface-700 shrink-0',
      orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full',
    ]"
    :orientation="orientation"
    :decorative="decorative"
    data-ui="separator"
    :data-provider="provider"
  />
</template>
