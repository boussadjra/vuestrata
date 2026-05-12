<script setup lang="ts">
import { Tabs } from '@vuetify/v0'

import BaseTabsField from '@/components/ui/base/BaseTabsField.vue'
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
  <BaseTabsField
    v-bind="$props"
    provider="vuetify0"
    :root-component="Tabs.Root"
    :list-component="Tabs.List"
    :item-component="Tabs.Item"
    :panel-component="Tabs.Panel"
    mandatory="force"
    @update:modelValue="emit('update:modelValue', $event)"
  />
</template>
