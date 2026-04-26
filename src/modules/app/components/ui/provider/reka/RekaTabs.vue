<script setup lang="ts">
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'

import type { TabItem } from '~/types'

export type { TabItem }

export interface TabsProps {
  tabs: TabItem[]
  defaultValue?: string
  modelValue?: string
}

defineProps<TabsProps>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <TabsRoot
    :model-value="modelValue"
    :default-value="defaultValue || tabs[0]?.value"
    @update:model-value="(v) => emit('update:modelValue', v as string)"
  >
    <TabsList
      class="border-surface-200 dark:border-surface-700 flex gap-1 border-b"
      data-provider="reka"
      data-ui="tabs"
    >
      <TabsTrigger
        v-for="tab in tabs"
        :key="tab.value"
        :value="tab.value"
        :disabled="tab.disabled"
        class="text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 data-[state=active]:text-primary-600 dark:data-[state=active]:text-primary-400 data-[state=active]:after:bg-primary-500 relative px-4 py-2 text-sm font-medium transition-colors outline-none after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.5 after:bg-transparent after:transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ tab.label }}
      </TabsTrigger>
    </TabsList>

    <TabsContent v-for="tab in tabs" :key="tab.value" :value="tab.value" class="pt-4 outline-none">
      <slot :name="tab.value" />
    </TabsContent>
  </TabsRoot>
</template>
