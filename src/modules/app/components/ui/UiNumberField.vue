<script setup lang="ts">
import type { NumberFieldProps } from '@/components/ui/base'
import BaseNumberFieldInput from '@/components/ui/base/BaseNumberFieldInput.vue'

defineProps<NumberFieldProps>()
</script>

<template>
  <BaseNumberFieldInput v-bind="$props" provider="reka" />
</template>
