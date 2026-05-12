<script setup lang="ts">
import {
  AccordionRoot,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  AccordionHeader,
} from 'reka-ui'

import BaseAccordionField from '@/components/ui/base/BaseAccordionField.vue'
import type { AccordionItemData } from '~/types'

export type { AccordionItemData }

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
  root: AccordionRoot,
  item: AccordionItem,
  trigger: AccordionTrigger,
  content: AccordionContent,
  header: AccordionHeader,
}
</script>

<template>
  <BaseAccordionField provider="reka" :components="components" v-bind="$props">
    <template v-for="(_, slotName) in $slots" #[slotName]="slotProps">
      <slot :name="slotName" v-bind="slotProps ?? {}" />
    </template>
  </BaseAccordionField>
</template>
