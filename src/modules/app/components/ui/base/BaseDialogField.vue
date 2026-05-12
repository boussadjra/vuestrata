<script setup lang="ts">
import type { Component } from 'vue'

import { resolveIcon } from '~/config/icon-provider'

interface BaseDialogComponents {
  root: Component
  trigger: Component
  content: Component
  title: Component
  description: Component
  close: Component
  portal?: Component
  overlay?: Component
}

export interface BaseDialogProps {
  provider: 'reka' | 'vuetify0'
  components: BaseDialogComponents
  open?: boolean
  title?: string
  description?: string
  contentClass?: string
}

const props = withDefaults(defineProps<BaseDialogProps>(), {
  open: undefined,
  contentClass: '',
})

const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const slots = useSlots()

const hasPortal = computed(() => Boolean(props.components.portal))

const contentProvider = computed(() => (props.provider === 'vuetify0' ? props.provider : undefined))
const overlayProvider = computed(() => (props.provider === 'reka' ? props.provider : undefined))

function onOpenUpdate(value: boolean) {
  emit('update:open', value)
}
</script>

<template>
  <component
    :is="components.root"
    :open="provider === 'reka' ? props.open : undefined"
    :model-value="provider === 'vuetify0' ? props.open : undefined"
    @update:open="onOpenUpdate"
    @update:model-value="onOpenUpdate"
  >
    <component :is="components.trigger" v-if="slots.trigger" as-child>
      <slot name="trigger" />
    </component>

    <component :is="components.portal" v-if="hasPortal">
      <component
        :is="components.overlay"
        v-if="components.overlay"
        class="animate-fade-in fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        data-ui="dialog-overlay"
        :data-provider="overlayProvider"
      />
      <component
        :is="components.content"
        :class="[
          'dark:bg-surface-800 shadow-elevated animate-scale-in fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 focus:outline-none',
          props.contentClass,
        ]"
        data-ui="dialog"
        :data-provider="contentProvider"
      >
        <component :is="components.title" v-if="props.title" class="mb-1 text-lg font-semibold">
          {{ props.title }}
        </component>
        <component
          :is="components.description"
          v-if="props.description"
          class="text-surface-500 mb-4 text-sm"
        >
          {{ props.description }}
        </component>

        <slot />

        <component
          :is="components.close"
          class="hover:bg-surface-100 dark:hover:bg-surface-700 absolute top-4 right-4 rounded-md p-1 transition-colors"
          aria-label="Close"
        >
          <span :class="[resolveIcon('close'), 'h-4 w-4']" />
        </component>
      </component>
    </component>

    <component
      :is="components.content"
      v-else
      :class="[
        'dark:bg-surface-800 shadow-elevated animate-scale-in fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 focus:outline-none',
        props.contentClass,
      ]"
      data-ui="dialog"
      :data-provider="contentProvider"
    >
      <div
        class="animate-fade-in fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        data-ui="dialog-overlay"
      />
      <component :is="components.title" v-if="props.title" class="mb-1 text-lg font-semibold">
        {{ props.title }}
      </component>
      <component
        :is="components.description"
        v-if="props.description"
        class="text-surface-500 mb-4 text-sm"
      >
        {{ props.description }}
      </component>

      <slot />

      <component
        :is="components.close"
        class="hover:bg-surface-100 dark:hover:bg-surface-700 absolute top-4 right-4 rounded-md p-1 transition-colors"
        aria-label="Close"
      >
        <span :class="[resolveIcon('close'), 'h-4 w-4']" />
      </component>
    </component>
  </component>
</template>
