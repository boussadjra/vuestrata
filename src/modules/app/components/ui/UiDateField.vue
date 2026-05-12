<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiDateField = resolveUiComponent('DateField')
</script>

<template>
  <component :is="UiDateField" v-bind="$props">
    <slot />
  </component>
</template>
