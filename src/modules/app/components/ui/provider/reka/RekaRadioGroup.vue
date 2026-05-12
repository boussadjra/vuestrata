<script setup lang="ts">
import type { RadioGroupProps } from '@/components/ui/base'
import BaseRadioGroupField from '@/components/ui/base/BaseRadioGroupField.vue'

defineProps<RadioGroupProps>()
</script>

<template>
  <BaseRadioGroupField v-bind="$props" provider="reka" />
</template>
