<script setup lang="ts">
import { Popover } from '@vuetify/v0'

export interface TooltipProps {
  content: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  delayDuration?: number
}

const positionAreaMap: Record<string, string> = {
  top: 'top',
  bottom: 'bottom',
  left: 'start',
  right: 'end',
}

withDefaults(defineProps<TooltipProps>(), {
  side: 'top',
  delayDuration: 300,
})
</script>

<template>
  <Popover.Root :open-delay="delayDuration" :close-delay="0">
    <Popover.Activator as-child>
      <slot />
    </Popover.Activator>
    <Popover.Content
      role="tooltip"
      :position-area="positionAreaMap[side!]"
      position-try="most-width top"
      class="bg-surface-900 dark:bg-surface-100 dark:text-surface-900 animate-fade-in z-50 rounded-md px-3 py-1.5 text-xs text-white shadow-md select-none"
      data-ui="tooltip"
      data-provider="vuetify0"
    >
      {{ content }}
    </Popover.Content>
  </Popover.Root>
</template>
