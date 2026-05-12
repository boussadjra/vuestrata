<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiYearRangePicker = resolveUiComponent('YearRangePicker')
</script>

<template>
  <component :is="UiYearRangePicker" v-bind="$props">
    <slot />
  </component>
</template>
