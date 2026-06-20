<script setup lang="ts">
import { Tabs } from '@vuetify/v0'
import type { Component } from 'vue'

import BaseTabsField from '@/components/ui/base/BaseTabsField.vue'
import type { TabItem } from '~/types'

export interface TabsProps {
  tabs: TabItem[]
  defaultValue?: string
  modelValue?: string
}

defineProps<TabsProps>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const rootComponent = Tabs.Root as unknown as Component
const listComponent = Tabs.List as unknown as Component
const itemComponent = Tabs.Item as unknown as Component
const panelComponent = Tabs.Panel as unknown as Component
</script>

<template>
  <BaseTabsField
    v-bind="$props"
    provider="vuetify0"
    :root-component="rootComponent"
    :list-component="listComponent"
    :item-component="itemComponent"
    :panel-component="panelComponent"
    mandatory="force"
    @update:modelValue="emit('update:modelValue', $event)"
  />
</template>
