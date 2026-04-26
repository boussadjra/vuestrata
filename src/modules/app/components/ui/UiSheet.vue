<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiSheet = resolveUiComponent('Sheet')
</script>

<template>
  <component :is="UiSheet" v-bind="$attrs">
    <template #trigger><slot name="trigger" /></template>
    <slot />
  </component>
</template>
