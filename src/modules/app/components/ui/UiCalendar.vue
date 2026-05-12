<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiCalendar = resolveUiComponent('Calendar')
</script>

<template>
  <component :is="UiCalendar" v-bind="$props">
    <slot />
  </component>
</template>
