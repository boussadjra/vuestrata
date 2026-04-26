<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiBadge = resolveUiComponent('Badge')
</script>

<template>
  <component :is="UiBadge" v-bind="$attrs">
    <slot />
  </component>
</template>
