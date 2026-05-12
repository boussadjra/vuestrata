<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiTimeRangePicker = resolveUiComponent('TimeRangePicker')
</script>

<template>
  <component :is="UiTimeRangePicker" v-bind="$props">
    <slot />
  </component>
</template>
