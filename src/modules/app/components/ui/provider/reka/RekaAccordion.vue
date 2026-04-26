<script setup lang="ts">
import {
  AccordionRoot,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  AccordionHeader,
} from 'reka-ui'

import { resolveIcon } from '~/config/icon-provider'
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
</script>

<template>
  <AccordionRoot
    :type="type as 'single' | 'multiple'"
    :collapsible="type === 'single' ? collapsible : undefined"
    :default-value="defaultValue"
    class="divide-surface-200 dark:divide-surface-700 border-surface-200 dark:border-surface-700 w-full divide-y overflow-hidden rounded-lg border"
    data-ui="accordion"
    data-provider="reka"
  >
    <AccordionItem
      v-for="item in items"
      :key="item.value"
      :value="item.value"
      :disabled="item.disabled"
      class="dark:bg-surface-800 bg-white"
    >
      <AccordionHeader>
        <AccordionTrigger
          class="group text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700/60 flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <slot :name="`trigger-${item.value}`" :item="item">
            {{ item.title }}
          </slot>
          <span
            :class="[
              resolveIcon('chevron-down'),
              'text-surface-400 h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180',
            ]"
          />
        </AccordionTrigger>
      </AccordionHeader>
      <AccordionContent
        class="data-[state=open]:animate-slide-down data-[state=closed]:animate-slide-up overflow-hidden text-sm"
      >
        <div class="text-surface-600 dark:text-surface-400 px-4 pb-3">
          <slot :name="`content-${item.value}`" :item="item">
            {{ item.content }}
          </slot>
        </div>
      </AccordionContent>
    </AccordionItem>
  </AccordionRoot>
</template>
