<script setup lang="ts">
import {
  TooltipArrow,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from 'reka-ui'

export interface TooltipProps {
  content: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  delayDuration?: number
}

const props = withDefaults(defineProps<TooltipProps>(), {
  side: 'top',
  delayDuration: 300,
})
</script>

<template>
  <TooltipProvider>
    <TooltipRoot :delay-duration="props.delayDuration">
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>

      <TooltipPortal>
        <TooltipContent
          :side="props.side"
          :side-offset="6"
          class="bg-surface-900 dark:bg-surface-100 dark:text-surface-900 animate-fade-in z-50 rounded-md px-3 py-1.5 text-xs text-white shadow-md select-none"
          data-ui="tooltip"
          data-provider="reka"
        >
          {{ props.content }}
          <TooltipArrow class="fill-surface-900 dark:fill-surface-100" :width="8" :height="4" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
