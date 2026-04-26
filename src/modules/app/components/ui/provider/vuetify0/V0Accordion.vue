<script setup lang="ts">
import { ExpansionPanel } from '@vuetify/v0'

import { resolveIcon } from '~/config/icon-provider'
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
</script>

<template>
  <ExpansionPanel.Group
    :multiple="type === 'multiple'"
    :mandatory="!collapsible ? 'force' : false"
    :default-value="defaultValue"
    class="divide-surface-200 dark:divide-surface-700 border-surface-200 dark:border-surface-700 w-full divide-y overflow-hidden rounded-lg border"
    data-ui="accordion"
    data-provider="vuetify0"
  >
    <ExpansionPanel.Root
      v-for="item in items"
      :key="item.value"
      :value="item.value"
      :disabled="item.disabled"
      class="dark:bg-surface-800 bg-white"
    >
      <ExpansionPanel.Activator
        class="group text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700/60 flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        <slot :name="`trigger-${item.value}`" :item="item">
          {{ item.title }}
        </slot>
        <ExpansionPanel.Cue>
          <span
            :class="[
              resolveIcon('chevron-down'),
              'text-surface-400 h-4 w-4 transition-transform duration-200 group-data-expanded:rotate-180',
            ]"
          />
        </ExpansionPanel.Cue>
      </ExpansionPanel.Activator>
      <ExpansionPanel.Content class="overflow-hidden text-sm">
        <div class="text-surface-600 dark:text-surface-400 px-4 pb-3">
          <slot :name="`content-${item.value}`" :item="item">
            {{ item.content }}
          </slot>
        </div>
      </ExpansionPanel.Content>
    </ExpansionPanel.Root>
  </ExpansionPanel.Group>
</template>
