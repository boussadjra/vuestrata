<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiComboBox = resolveUiComponent('ComboBox')
</script>

<template>
  <component :is="UiComboBox" v-bind="$attrs">
    <slot />
  </component>
</template>
