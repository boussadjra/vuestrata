<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiSlider = resolveUiComponent('Slider')
</script>

<template>
  <component :is="UiSlider" v-bind="$attrs">
    <slot />
  </component>
</template>
