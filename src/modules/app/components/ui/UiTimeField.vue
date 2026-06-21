<script setup lang="ts">
import type { TimeFieldProps } from '@/components/ui/base'
import BaseTimeFieldInput from '@/components/ui/base/BaseTimeFieldInput.vue'

const props = withDefaults(defineProps<TimeFieldProps>(), {
  size: 'md',
})

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <BaseTimeFieldInput v-bind="props" provider="reka" />
</template>
