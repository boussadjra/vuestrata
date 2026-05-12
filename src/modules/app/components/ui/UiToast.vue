<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiToast = resolveUiComponent('Toast')
</script>

<template>
  <component :is="UiToast" v-bind="$props">
    <slot />
  </component>
</template>
