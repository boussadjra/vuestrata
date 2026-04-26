<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiTooltip = resolveUiComponent('Tooltip')
</script>

<template>
  <component :is="UiTooltip" v-bind="$attrs">
    <slot />
  </component>
</template>
