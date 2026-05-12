<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiMonthPicker = resolveUiComponent('MonthPicker')
</script>

<template>
  <component :is="UiMonthPicker" v-bind="$props">
    <slot />
  </component>
</template>
