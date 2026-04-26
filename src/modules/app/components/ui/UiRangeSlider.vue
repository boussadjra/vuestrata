<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiRangeSlider = resolveUiComponent('RangeSlider')
</script>

<template>
  <component :is="UiRangeSlider" v-bind="$attrs">
    <slot />
  </component>
</template>
