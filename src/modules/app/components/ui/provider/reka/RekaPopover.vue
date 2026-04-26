<script setup lang="ts">
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
  PopoverClose,
  PopoverArrow,
} from 'reka-ui'

import { resolveIcon } from '~/config/icon-provider'

export interface PopoverProps {
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

withDefaults(defineProps<PopoverProps>(), {
  side: 'bottom',
  align: 'center',
})
</script>

<template>
  <PopoverRoot>
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side="side"
        :align="align"
        :side-offset="8"
        class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 shadow-elevated animate-scale-in z-50 w-72 rounded-xl border bg-white p-4 outline-none"
        data-ui="popover"
        data-provider="reka"
      >
        <slot />
        <PopoverClose
          class="hover:bg-surface-100 dark:hover:bg-surface-700 absolute top-2 right-2 rounded-md p-1 transition-colors"
          aria-label="Close"
        >
          <span :class="[resolveIcon('close'), 'h-3.5 w-3.5']" />
        </PopoverClose>
        <PopoverArrow class="dark:fill-surface-800 fill-white" :width="12" :height="6" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
