<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiAccordion = resolveUiComponent('Accordion')
</script>

<template>
  <component :is="UiAccordion" v-bind="$props" />
</template>
