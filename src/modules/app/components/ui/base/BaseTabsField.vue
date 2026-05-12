<script setup lang="ts">
import type { Component } from 'vue'

import type { TabItem } from '~/types'

export interface BaseTabsProps {
  provider: 'reka' | 'vuetify0'
  tabs: TabItem[]
  defaultValue?: string
  modelValue?: string
  rootComponent: Component
  listComponent: Component
  itemComponent: Component
  panelComponent: Component
  mandatory?: 'force' | boolean
}

const props = defineProps<BaseTabsProps>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const itemClasses = computed(() => [
  'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 relative px-4 py-2 text-sm font-medium transition-colors outline-none',
  'after:absolute after:right-0 after:bottom-0 after:left-0 after:h-0.5 after:bg-transparent after:transition-colors',
  'disabled:cursor-not-allowed disabled:opacity-50',
  props.provider === 'reka'
    ? 'data-[state=active]:text-primary-600 dark:data-[state=active]:text-primary-400 data-[state=active]:after:bg-primary-500'
    : 'data-selected:text-primary-600 dark:data-selected:text-primary-400 data-selected:after:bg-primary-500',
])

function onUpdateModelValue(value: unknown) {
  if (typeof value === 'string') {
    emit('update:modelValue', value)
  }
}
</script>

<template>
  <component
    :is="rootComponent"
    :model-value="modelValue"
    :default-value="defaultValue || tabs[0]?.value"
    :mandatory="mandatory || undefined"
    @update:model-value="onUpdateModelValue"
  >
    <component
      :is="listComponent"
      class="border-surface-200 dark:border-surface-700 flex gap-1 border-b"
      :data-provider="provider"
      data-ui="tabs"
    >
      <component
        :is="itemComponent"
        v-for="tab in tabs"
        :key="tab.value"
        :value="tab.value"
        :disabled="tab.disabled"
        :class="itemClasses"
      >
        {{ tab.label }}
      </component>
    </component>

    <component
      :is="panelComponent"
      v-for="tab in tabs"
      :key="tab.value"
      :value="tab.value"
      class="pt-4 outline-none"
    >
      <slot :name="tab.value" />
    </component>
  </component>
</template>
