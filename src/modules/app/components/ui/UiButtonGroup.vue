<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiButtonGroup = resolveUiComponent('ButtonGroup')
</script>

<template>
  <component :is="UiButtonGroup" v-bind="$props">
    <slot />
  </component>
</template>
