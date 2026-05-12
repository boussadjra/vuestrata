<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'
import type { BaseFieldProps } from '@/types'

export interface RadioOption {
  label: string
  value: string
  disabled?: boolean
  description?: string
}

export interface UiRadioGroupProps extends BaseFieldProps {
  modelValue?: string
  options: RadioOption[]
  hint?: string
  orientation?: 'vertical' | 'horizontal'
}

defineProps<UiRadioGroupProps>()
defineEmits<{ 'update:modelValue': [value: string] }>()

const UiRadioGroup = resolveUiComponent('RadioGroup')
</script>

<template>
  <component :is="UiRadioGroup" v-bind="$props">
    <slot />
  </component>
</template>
