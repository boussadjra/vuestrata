<script setup lang="ts">
import type { ToggleProps } from '@/components/ui/base'
import BaseToggleField from '@/components/ui/base/BaseToggleField.vue'

defineProps<ToggleProps>()
</script>

<template>
  <BaseToggleField v-bind="$props" provider="reka">
    <slot />
  </BaseToggleField>
</template>
