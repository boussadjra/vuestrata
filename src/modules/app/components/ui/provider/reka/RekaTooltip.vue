<script setup lang="ts">
import {
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
  TooltipArrow,
  TooltipProvider,
} from 'reka-ui'

export interface TooltipProps {
  content: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  delayDuration?: number
}

withDefaults(defineProps<TooltipProps>(), {
  side: 'top',
  delayDuration: 300,
})
</script>

<template>
  <TooltipProvider>
    <TooltipRoot :delay-duration="delayDuration">
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="side"
          :side-offset="6"
          class="bg-surface-900 dark:bg-surface-100 dark:text-surface-900 animate-fade-in z-50 rounded-md px-3 py-1.5 text-xs text-white shadow-md select-none"
          data-ui="tooltip"
          data-provider="reka"
        >
          {{ content }}
          <TooltipArrow class="fill-surface-900 dark:fill-surface-100" :width="8" :height="4" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
