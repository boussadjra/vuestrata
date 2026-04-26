<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'
import type { BaseFieldProps } from '@/types'

export interface UiNumberFieldProps extends BaseFieldProps {
  modelValue?: number
  placeholder?: string
  hint?: string
  min?: number
  max?: number
  step?: number
  locale?: string
  formatOptions?: Intl.NumberFormatOptions
}

defineProps<UiNumberFieldProps>()
defineEmits<{ 'update:modelValue': [value: number] }>()

const UiNumberField = resolveUiComponent('NumberField')
</script>

<template>
  <component :is="UiNumberField" v-bind="$attrs">
    <slot />
  </component>
</template>
