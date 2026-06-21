<script setup lang="ts">
import type { SliderProps } from '@/components/ui/base'
import BaseSliderField from '@/components/ui/base/BaseSliderField.vue'

defineProps<SliderProps>()
</script>

<template>
  <BaseSliderField v-bind="$props" provider="reka" />
</template>
