<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiSeparator = resolveUiComponent('Separator')
</script>

<template>
  <component :is="UiSeparator" v-bind="$attrs">
    <slot />
  </component>
</template>
