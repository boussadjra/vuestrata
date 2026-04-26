<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiProgress = resolveUiComponent('Progress')
</script>

<template>
  <component :is="UiProgress" v-bind="$attrs">
    <slot />
  </component>
</template>
