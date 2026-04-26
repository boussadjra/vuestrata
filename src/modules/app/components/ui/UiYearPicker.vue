<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiYearPicker = resolveUiComponent('YearPicker')
</script>

<template>
  <component :is="UiYearPicker" v-bind="$attrs">
    <slot />
  </component>
</template>
