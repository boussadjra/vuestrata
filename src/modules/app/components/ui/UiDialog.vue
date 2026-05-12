<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiDialog = resolveUiComponent('Dialog')
</script>

<template>
  <component :is="UiDialog" v-bind="$props">
    <template #trigger><slot name="trigger" /></template>
    <slot />
  </component>
</template>
