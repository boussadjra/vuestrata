<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiTreeSelect = resolveUiComponent('TreeSelect')
</script>

<template>
  <component :is="UiTreeSelect" v-bind="$props">
    <slot />
  </component>
</template>
