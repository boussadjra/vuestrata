<script setup lang="ts">
import BaseOptionGroup from '@/components/ui/base/BaseOptionGroup.vue'

defineProps<{
  label: string
}>()
</script>

<template>
  <BaseOptionGroup v-bind="$props" provider="reka">
    <slot />
  </BaseOptionGroup>
</template>
