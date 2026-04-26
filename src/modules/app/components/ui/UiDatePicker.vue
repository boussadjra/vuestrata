<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiDatePicker = resolveUiComponent('DatePicker')
</script>

<template>
  <component :is="UiDatePicker" v-bind="$attrs">
    <slot />
  </component>
</template>
