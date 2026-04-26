<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiCommandPalette = resolveUiComponent('CommandPalette')
</script>

<template>
  <component :is="UiCommandPalette" v-bind="$attrs">
    <slot />
  </component>
</template>
