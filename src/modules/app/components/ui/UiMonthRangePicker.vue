<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiMonthRangePicker = resolveUiComponent('MonthRangePicker')
</script>

<template>
  <component :is="UiMonthRangePicker" v-bind="$props">
    <slot />
  </component>
</template>
