<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiAutocomplete = resolveUiComponent('ComboBox')
</script>

<template>
  <component :is="UiAutocomplete" v-bind="{ ...$attrs, openOnFocus: true }">
    <slot />
  </component>
</template>
