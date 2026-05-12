<script setup lang="ts">
import BaseStepperField from '@/components/ui/base/BaseStepperField.vue'
import type { StepperItem } from '~/types'

export type { StepperItem }

export interface StepperProps {
  steps: StepperItem[]
  modelValue?: number
}

const props = withDefaults(defineProps<StepperProps>(), {
  modelValue: 0,
})

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>

<template>
  <BaseStepperField
    v-bind="$props"
    provider="reka"
    @update:modelValue="emit('update:modelValue', $event)"
  />
</template>
