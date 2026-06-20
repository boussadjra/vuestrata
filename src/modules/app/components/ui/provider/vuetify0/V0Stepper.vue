<script setup lang="ts">
import { Step } from '@vuetify/v0'
import type { Component } from 'vue'

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
const rootComponent = Step.Root as unknown as Component
const itemComponent = Step.Item as unknown as Component
</script>

<template>
  <BaseStepperField
    v-bind="$props"
    provider="vuetify0"
    :root-component="rootComponent"
    :item-component="itemComponent"
    @update:modelValue="emit('update:modelValue', $event)"
  />
</template>
