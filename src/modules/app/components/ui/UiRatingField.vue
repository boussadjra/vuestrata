<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiRatingField = resolveUiComponent('RatingField')
</script>

<template>
  <component :is="UiRatingField" v-bind="$attrs">
    <slot />
  </component>
</template>
