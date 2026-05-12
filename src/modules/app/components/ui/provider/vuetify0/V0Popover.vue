<script setup lang="ts">
import { Popover } from '@vuetify/v0'

import BasePopoverField from '@/components/ui/base/BasePopoverField.vue'

// CSS Anchor Positioning: Chrome 125+, Edge 125+, Firefox 147+ beta, Safari unsupported.
// See https://0.vuetifyjs.com/components/popover for fallback guidance.

export interface PopoverProps {
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

withDefaults(defineProps<PopoverProps>(), {
  side: 'bottom',
  align: 'center',
})

const components = {
  root: Popover.Root,
  trigger: Popover.Activator,
  content: Popover.Content,
}
</script>

<template>
  <BasePopoverField provider="vuetify0" :components="components" v-bind="$props">
    <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps ?? {}" />
    </template>
  </BasePopoverField>
</template>
