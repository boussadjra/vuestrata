<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiDatetimePicker = resolveUiComponent('DatetimePicker')
</script>

<template>
  <component :is="UiDatetimePicker" v-bind="$props">
    <slot />
  </component>
</template>
