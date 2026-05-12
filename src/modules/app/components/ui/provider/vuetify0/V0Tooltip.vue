<script setup lang="ts">
import { Popover } from '@vuetify/v0'

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
  root: Popover.Root,
  trigger: Popover.Activator,
  content: Popover.Content,
}
</script>

<template>
  <BaseTooltipField provider="vuetify0" :components="components" v-bind="$props">
    <slot />
  </BaseTooltipField>
</template>
