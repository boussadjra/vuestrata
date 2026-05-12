<script setup lang="ts">
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
  TooltipArrow,
} from 'reka-ui'

import BaseTooltipField from '@/components/ui/base/BaseTooltipField.vue'

export interface TooltipProps {
  content: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  delayDuration?: number
}

withDefaults(defineProps<TooltipProps>(), {
  side: 'top',
  delayDuration: 300,
})

const components = {
  root: TooltipRoot,
  trigger: TooltipTrigger,
  portal: TooltipPortal,
  content: TooltipContent,
  arrow: TooltipArrow,
}
</script>

<template>
  <TooltipProvider>
    <BaseTooltipField provider="reka" :components="components" v-bind="$props">
      <slot />
    </BaseTooltipField>
  </TooltipProvider>
</template>
