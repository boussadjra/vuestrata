<script setup lang="ts">
import type { SteppedFormProps } from '@/components/ui/base'
import BaseSteppedFormLayout from '@/components/ui/base/BaseSteppedFormLayout.vue'

defineProps<SteppedFormProps>()
</script>

<template>
  <BaseSteppedFormLayout v-bind="$props" provider="vuetify0">
    <template #default="slotProps">
      <slot v-bind="slotProps" />
    </template>
  </BaseSteppedFormLayout>
</template>
