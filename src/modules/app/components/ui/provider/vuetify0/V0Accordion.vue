<script setup lang="ts">
import { ExpansionPanel } from '@vuetify/v0'

import BaseAccordionField from '@/components/ui/base/BaseAccordionField.vue'
import type { AccordionItemData } from '~/types'

export interface AccordionProps {
  items: AccordionItemData[]
  type?: 'single' | 'multiple'
  collapsible?: boolean
  defaultValue?: string | string[]
}

withDefaults(defineProps<AccordionProps>(), {
  type: 'single',
  collapsible: true,
})

const components = {
  root: ExpansionPanel.Group,
  item: ExpansionPanel.Root,
  trigger: ExpansionPanel.Activator,
  content: ExpansionPanel.Content,
  cue: ExpansionPanel.Cue,
}
</script>

<template>
  <BaseAccordionField provider="vuetify0" :components="components" v-bind="$props">
    <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps ?? {}" />
    </template>
  </BaseAccordionField>
</template>
