<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiColorPicker = resolveUiComponent('ColorPicker')
</script>

<template>
  <component :is="UiColorPicker" v-bind="$attrs">
    <slot />
  </component>
</template>
