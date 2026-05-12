<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiCard = resolveUiComponent('Card')
</script>

<template>
  <component :is="UiCard" v-bind="$props">
    <template v-if="$slots.header" #header><slot name="header" /></template>
    <slot />
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </component>
</template>
