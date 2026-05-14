<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'
import type { BaseFieldProps } from '@/types'

export interface UiCheckboxProps extends Omit<BaseFieldProps, 'size'> {
  modelValue?: boolean | 'indeterminate'
  trueValue?: boolean
  falseValue?: boolean
  indeterminate?: boolean
  size?: 'sm' | 'md' | 'lg'
}

withDefaults(defineProps<UiCheckboxProps>(), {
  modelValue: undefined,
  trueValue: undefined,
  falseValue: undefined,
  indeterminate: undefined,
})
defineEmits<{ 'update:modelValue': [value: boolean | 'indeterminate'] }>()

const UiCheckbox = resolveUiComponent('Checkbox')
</script>

<template>
  <component :is="UiCheckbox" v-bind="$props">
    <slot />
  </component>
</template>
