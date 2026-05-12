<script setup lang="ts">
import type { Component } from 'vue'

import { resolveIcon } from '~/config/icon-provider'
import type { AccordionItemData } from '~/types'

interface BaseAccordionComponents {
  root: Component
  item: Component
  trigger: Component
  content: Component
  header?: Component
  cue?: Component
}

export interface BaseAccordionProps {
  provider: 'reka' | 'vuetify0'
  components: BaseAccordionComponents
  items: AccordionItemData[]
  type?: 'single' | 'multiple'
  collapsible?: boolean
  defaultValue?: string | string[]
}

const props = withDefaults(defineProps<BaseAccordionProps>(), {
  type: 'single',
  collapsible: true,
})

const rootProps = computed(() => {
  if (props.provider === 'reka') {
    return {
      type: props.type,
      collapsible: props.type === 'single' ? props.collapsible : undefined,
      defaultValue: props.defaultValue,
    }
  }

  return {
    multiple: props.type === 'multiple',
    mandatory: !props.collapsible ? 'force' : false,
    defaultValue: props.defaultValue,
  }
})

const contentClass = computed(() => {
  if (props.provider === 'reka') {
    return 'data-[state=open]:animate-slide-down data-[state=closed]:animate-slide-up overflow-hidden text-sm'
  }

  return 'overflow-hidden text-sm'
})

const iconRotateClass = computed(() => {
  return props.provider === 'reka'
    ? 'group-data-[state=open]:rotate-180'
    : 'group-data-expanded:rotate-180'
})
</script>

<template>
  <component
    :is="components.root"
    v-bind="rootProps"
    class="divide-surface-200 dark:divide-surface-700 border-surface-200 dark:border-surface-700 w-full divide-y overflow-hidden rounded-lg border"
    data-ui="accordion"
    :data-provider="provider"
  >
    <component
      :is="components.item"
      v-for="item in items"
      :key="item.value"
      :value="item.value"
      :disabled="item.disabled"
      class="dark:bg-surface-800 bg-white"
    >
      <component :is="components.header" v-if="components.header">
        <component
          :is="components.trigger"
          class="group text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700/60 flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <slot :name="`trigger-${item.value}`" :item="item">
            {{ item.title }}
          </slot>
          <span
            :class="[
              resolveIcon('chevron-down'),
              'text-surface-400 h-4 w-4 transition-transform duration-200',
              iconRotateClass,
            ]"
          />
        </component>
      </component>

      <component
        :is="components.trigger"
        v-else
        class="group text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700/60 flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        <slot :name="`trigger-${item.value}`" :item="item">
          {{ item.title }}
        </slot>
        <component :is="components.cue" v-if="components.cue">
          <span
            :class="[
              resolveIcon('chevron-down'),
              'text-surface-400 h-4 w-4 transition-transform duration-200',
              iconRotateClass,
            ]"
          />
        </component>
        <span
          v-else
          :class="[
            resolveIcon('chevron-down'),
            'text-surface-400 h-4 w-4 transition-transform duration-200',
            iconRotateClass,
          ]"
        />
      </component>

      <component :is="components.content" :class="contentClass">
        <div class="text-surface-600 dark:text-surface-400 px-4 pb-3">
          <slot :name="`content-${item.value}`" :item="item">
            {{ item.content }}
          </slot>
        </div>
      </component>
    </component>
  </component>
</template>
