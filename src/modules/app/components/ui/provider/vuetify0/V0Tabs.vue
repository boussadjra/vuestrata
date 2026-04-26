<script setup lang="ts">
import { Tabs } from '@vuetify/v0'

import type { TabItem } from '~/types'

export interface TabsProps {
  tabs: TabItem[]
  defaultValue?: string
  modelValue?: string
}

defineProps<TabsProps>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <Tabs.Root
    :model-value="modelValue"
    :default-value="defaultValue || tabs[0]?.value"
    mandatory="force"
    @update:model-value="(v: string) => emit('update:modelValue', v)"
  >
    <Tabs.List
      class="border-surface-200 dark:border-surface-700 flex gap-1 border-b"
      data-ui="tabs"
      data-provider="vuetify0"
    >
      <Tabs.Item
        v-for="tab in tabs"
        :key="tab.value"
        :value="tab.value"
        :disabled="tab.disabled"
        class="text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 data-selected:text-primary-600 dark:data-selected:text-primary-400 data-selected:after:bg-primary-500 relative px-4 py-2 text-sm font-medium transition-colors outline-none after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.5 after:bg-transparent after:transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ tab.label }}
      </Tabs.Item>
    </Tabs.List>

    <Tabs.Panel v-for="tab in tabs" :key="tab.value" :value="tab.value" class="pt-4 outline-none">
      <slot :name="tab.value" />
    </Tabs.Panel>
  </Tabs.Root>
</template>
