<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiPopover = resolveUiComponent('Popover')
</script>

<template>
  <component :is="UiPopover" v-bind="$props">
    <template #trigger><slot name="trigger" /></template>
    <slot />
  </component>
</template>
