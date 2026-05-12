<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiRatingField = resolveUiComponent('RatingField')
</script>

<template>
  <component :is="UiRatingField" v-bind="$props">
    <slot />
  </component>
</template>
