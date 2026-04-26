<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'
import type { BaseFieldProps } from '@/types'

export interface UiTextFieldProps extends BaseFieldProps {
  modelValue?: string
  type?: 'text' | 'email' | 'password' | 'tel' | 'url'
  placeholder?: string
  hint?: string
}

defineProps<UiTextFieldProps>()
defineEmits<{ 'update:modelValue': [value: string] }>()

const UiTextField = resolveUiComponent('TextField')
</script>

<template>
  <component :is="UiTextField" v-bind="$attrs">
    <slot />
  </component>
</template>
