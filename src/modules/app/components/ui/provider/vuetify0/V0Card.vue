<script setup lang="ts">
export interface CardProps {
  title?: string
  subtitle?: string
  padding?: boolean
  hoverable?: boolean
}

const props = withDefaults(defineProps<CardProps>(), {
  padding: true,
  hoverable: false,
})

const classes = computed(() => [
  'card rounded-xl border border-surface-200 dark:border-surface-700',
  'bg-white dark:bg-surface-800 transition-all duration-200',
  props.hoverable ? 'hover:shadow-elevated cursor-pointer' : 'shadow-soft',
])
</script>

<template>
  <div :class="classes" data-provider="vuetify0" data-ui="card">
    <div
      v-if="title || $slots.header"
      class="border-surface-200 dark:border-surface-700 border-b px-6 py-4"
    >
      <slot name="header">
        <h3 class="text-base font-semibold">{{ title }}</h3>
        <p v-if="subtitle" class="text-surface-500 mt-0.5 text-sm">{{ subtitle }}</p>
      </slot>
    </div>
    <div :class="padding ? 'p-6' : ''">
      <slot />
    </div>
    <div v-if="$slots.footer" class="border-surface-200 dark:border-surface-700 border-t px-6 py-4">
      <slot name="footer" />
    </div>
  </div>
</template>
