<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiSelect = resolveUiComponent('Select')

defineOptions({
  inheritAttrs: false,
})
</script>

<template>
  <component :is="UiSelect" v-bind="{ ...$props, ...$attrs }">
    <slot />
  </component>
</template>
