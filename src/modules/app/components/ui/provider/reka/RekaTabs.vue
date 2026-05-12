<script setup lang="ts">
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'

import BaseTabsField from '@/components/ui/base/BaseTabsField.vue'
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
  <BaseTabsField
    v-bind="$props"
    provider="reka"
    :root-component="TabsRoot"
    :list-component="TabsList"
    :item-component="TabsTrigger"
    :panel-component="TabsContent"
    @update:modelValue="emit('update:modelValue', $event)"
  />
</template>
