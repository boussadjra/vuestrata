<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiSelect = resolveUiComponent('Select')
</script>

<template>
  <component :is="UiSelect" v-bind="$props">
    <slot />
  </component>
</template>
