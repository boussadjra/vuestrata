<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiEditable = resolveUiComponent('Editable')
</script>

<template>
  <component :is="UiEditable" v-bind="$attrs">
    <slot />
  </component>
</template>
