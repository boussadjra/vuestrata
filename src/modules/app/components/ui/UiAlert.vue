<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiAlert = resolveUiComponent('Alert')
</script>

<template>
  <component :is="UiAlert" v-bind="$props">
    <slot />
  </component>
</template>
