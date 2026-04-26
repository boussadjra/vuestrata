<script setup lang="ts">
import { Popover } from '@vuetify/v0'

import { resolveIcon } from '~/config/icon-provider'

// CSS Anchor Positioning: Chrome 125+, Edge 125+, Firefox 147+ beta, Safari unsupported.
// See https://0.vuetifyjs.com/components/popover for fallback guidance.

export interface PopoverProps {
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

const positionAreaMap: Record<string, string> = {
  bottom: 'bottom',
  top: 'top',
  left: 'start',
  right: 'end',
}

withDefaults(defineProps<PopoverProps>(), {
  side: 'bottom',
  align: 'center',
})
</script>

<template>
  <Popover.Root>
    <Popover.Activator as-child>
      <slot name="trigger" />
    </Popover.Activator>
    <Popover.Content
      :position-area="positionAreaMap[side!]"
      position-try="most-width bottom"
      class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 shadow-elevated animate-scale-in z-50 w-72 rounded-xl border bg-white p-4 outline-none"
      data-ui="popover"
      data-provider="vuetify0"
    >
      <slot />
      <button
        class="hover:bg-surface-100 dark:hover:bg-surface-700 absolute top-2 right-2 rounded-md p-1 transition-colors"
        aria-label="Close"
        @click="$el.closest('[data-popover-open]')?.dispatchEvent(new Event('close'))"
      >
        <span :class="[resolveIcon('close'), 'h-3.5 w-3.5']" />
      </button>
    </Popover.Content>
  </Popover.Root>
</template>
