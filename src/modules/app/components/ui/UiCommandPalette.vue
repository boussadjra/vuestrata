<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiCommandPalette = resolveUiComponent('CommandPalette')
</script>

<template>
  <component :is="UiCommandPalette" v-bind="$props">
    <slot />
  </component>
</template>
