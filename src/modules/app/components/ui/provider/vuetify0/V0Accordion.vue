<script setup lang="ts">
import { ExpansionPanel } from '@vuetify/v0'
import type { Component } from 'vue'

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
  root: ExpansionPanel.Group as Component,
  item: ExpansionPanel.Root as unknown as Component,
  trigger: ExpansionPanel.Activator as unknown as Component,
  content: ExpansionPanel.Content as unknown as Component,
  cue: ExpansionPanel.Cue as unknown as Component,
}
</script>

<template>
  <BaseAccordionField provider="vuetify0" :components="components" v-bind="$props">
    <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps ?? {}" />
    </template>
  </BaseAccordionField>
</template>
