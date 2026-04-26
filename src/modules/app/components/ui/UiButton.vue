<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiButton = resolveUiComponent('Button')
</script>

<template>
  <component :is="UiButton" v-bind="$attrs">
    <slot />
  </component>
</template>
