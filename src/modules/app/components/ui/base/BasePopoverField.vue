<script setup lang="ts">
import type { Component } from 'vue'

import { resolveIcon } from '~/config/icon-provider'

interface BasePopoverComponents {
  root: Component
  trigger: Component
  content: Component
  portal?: Component
  close?: Component
  arrow?: Component
}

export interface BasePopoverProps {
  provider: 'reka' | 'vuetify0'
  components: BasePopoverComponents
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

const props = withDefaults(defineProps<BasePopoverProps>(), {
  side: 'bottom',
  align: 'center',
})

const positionAreaMap: Record<string, string> = {
  bottom: 'bottom',
  top: 'top',
  left: 'start',
  right: 'end',
}

function onCloseClick(event: MouseEvent) {
  const target = event.currentTarget
  if (!(target instanceof Element)) return
  target.closest('[data-popover-open]')?.dispatchEvent(new Event('close'))
}
</script>

<template>
  <component :is="components.root">
    <component :is="components.trigger" as-child>
      <slot name="trigger" />
    </component>

    <component :is="components.portal" v-if="components.portal">
      <component
        :is="components.content"
        :side="props.side"
        :align="props.align"
        :side-offset="8"
        class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 shadow-elevated animate-scale-in z-50 w-72 rounded-xl border bg-white p-4 outline-none"
        data-ui="popover"
        :data-provider="provider"
      >
        <slot />
        <component
          :is="components.close"
          v-if="components.close"
          class="hover:bg-surface-100 dark:hover:bg-surface-700 absolute top-2 right-2 rounded-md p-1 transition-colors"
          aria-label="Close"
        >
          <span :class="[resolveIcon('close'), 'h-3.5 w-3.5']" />
        </component>
        <component
          :is="components.arrow"
          v-if="components.arrow"
          class="dark:fill-surface-800 fill-white"
          :width="12"
          :height="6"
        />
      </component>
    </component>

    <component
      :is="components.content"
      v-else
      :position-area="positionAreaMap[props.side!]"
      position-try="most-width bottom"
      class="border-surface-200 dark:border-surface-700 dark:bg-surface-800 shadow-elevated animate-scale-in z-50 w-72 rounded-xl border bg-white p-4 outline-none"
      data-ui="popover"
      :data-provider="provider"
    >
      <slot />
      <button
        class="hover:bg-surface-100 dark:hover:bg-surface-700 absolute top-2 right-2 rounded-md p-1 transition-colors"
        aria-label="Close"
        @click="onCloseClick"
      >
        <span :class="[resolveIcon('close'), 'h-3.5 w-3.5']" />
      </button>
    </component>
  </component>
</template>
