<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'

const UiSkeleton = resolveUiComponent('Skeleton')
</script>

<template>
  <component :is="UiSkeleton" v-bind="$props">
    <slot />
  </component>
</template>
