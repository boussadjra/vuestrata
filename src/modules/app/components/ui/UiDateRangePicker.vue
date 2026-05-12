<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiDateRangePicker = resolveUiComponent('DateRangePicker')
</script>

<template>
  <component :is="UiDateRangePicker" v-bind="$props">
    <slot />
  </component>
</template>
