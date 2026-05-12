<script setup lang="ts">
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
  PopoverClose,
  PopoverArrow,
} from 'reka-ui'

import BasePopoverField from '@/components/ui/base/BasePopoverField.vue'

export interface PopoverProps {
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

withDefaults(defineProps<PopoverProps>(), {
  side: 'bottom',
  align: 'center',
})

const components = {
  root: PopoverRoot,
  trigger: PopoverTrigger,
  portal: PopoverPortal,
  content: PopoverContent,
  close: PopoverClose,
  arrow: PopoverArrow,
}
</script>

<template>
  <BasePopoverField provider="reka" :components="components" v-bind="$props">
    <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps ?? {}" />
    </template>
  </BasePopoverField>
</template>
