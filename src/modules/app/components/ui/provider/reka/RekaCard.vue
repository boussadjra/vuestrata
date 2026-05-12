<script setup lang="ts">
import BaseCard from '@/components/ui/base/BaseCard.vue'

export interface CardProps {
  title?: string
  subtitle?: string
  padding?: boolean
  hoverable?: boolean
}

withDefaults(defineProps<CardProps>(), {
  padding: true,
  hoverable: false,
})
</script>

<template>
  <BaseCard v-bind="$props" provider="reka">
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </BaseCard>
</template>
