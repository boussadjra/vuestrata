<script setup lang="ts">
import { Step } from '@vuetify/v0'

import BaseStepperField from '@/components/ui/base/BaseStepperField.vue'
import type { StepperItem } from '~/types'

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
    provider="vuetify0"
    :root-component="Step.Root"
    :item-component="Step.Item"
    @update:modelValue="emit('update:modelValue', $event)"
  />
</template>
