<script setup lang="ts">
import type { Component } from 'vue'

interface BaseTooltipComponents {
  root: Component
  trigger: Component
  content: Component
  portal?: Component
  arrow?: Component
}

export interface BaseTooltipProps {
  provider: 'reka' | 'vuetify0'
  components: BaseTooltipComponents
  content: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  delayDuration?: number
}

const props = withDefaults(defineProps<BaseTooltipProps>(), {
  side: 'top',
  delayDuration: 300,
})

const positionAreaMap: Record<string, string> = {
  top: 'top',
  bottom: 'bottom',
  left: 'start',
  right: 'end',
}

const rootProps = computed(() => {
  if (props.provider === 'reka') {
    return {
      delayDuration: props.delayDuration,
    }
  }

  return {
    openDelay: props.delayDuration,
    closeDelay: 0,
  }
})

const contentProps = computed(() => {
  if (props.provider === 'reka') {
    return {
      side: props.side,
      sideOffset: 6,
    }
  }

  return {
    role: 'tooltip',
    positionArea: positionAreaMap[props.side!],
    positionTry: 'most-width top',
  }
})
</script>

<template>
  <component :is="components.root" v-bind="rootProps">
    <component :is="components.trigger" as-child>
      <slot />
    </component>

    <component :is="components.portal" v-if="components.portal">
      <component
        :is="components.content"
        v-bind="contentProps"
        class="bg-surface-900 dark:bg-surface-100 dark:text-surface-900 animate-fade-in z-50 rounded-md px-3 py-1.5 text-xs text-white shadow-md select-none"
        data-ui="tooltip"
        :data-provider="provider"
      >
        {{ props.content }}
        <component
          :is="components.arrow"
          v-if="components.arrow"
          class="fill-surface-900 dark:fill-surface-100"
          :width="8"
          :height="4"
        />
      </component>
    </component>

    <component
      :is="components.content"
      v-else
      v-bind="contentProps"
      class="bg-surface-900 dark:bg-surface-100 dark:text-surface-900 animate-fade-in z-50 rounded-md px-3 py-1.5 text-xs text-white shadow-md select-none"
      data-ui="tooltip"
      :data-provider="provider"
    >
      {{ props.content }}
      <component
        :is="components.arrow"
        v-if="components.arrow"
        class="fill-surface-900 dark:fill-surface-100"
        :width="8"
        :height="4"
      />
    </component>
  </component>
</template>
