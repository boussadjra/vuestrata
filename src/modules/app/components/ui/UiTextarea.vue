<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'
import type { BaseFieldProps } from '@/types'

export interface UiTextareaProps extends BaseFieldProps {
  modelValue?: string
  placeholder?: string
  hint?: string
  rows?: number
  maxlength?: number
  resize?: 'none' | 'vertical' | 'both'
}

defineProps<UiTextareaProps>()
defineEmits<{ 'update:modelValue': [value: string] }>()

const UiTextarea = resolveUiComponent('Textarea')
</script>

<template>
  <component :is="UiTextarea" v-bind="$attrs">
    <slot />
  </component>
</template>
