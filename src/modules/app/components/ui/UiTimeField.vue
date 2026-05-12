<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiTimeField = resolveUiComponent('TimeField')
</script>

<template>
  <component :is="UiTimeField" v-bind="$props">
    <slot />
  </component>
</template>
