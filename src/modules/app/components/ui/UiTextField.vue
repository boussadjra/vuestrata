<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'
import type { BaseFieldProps } from '@/types'

export interface UiTextFieldProps extends BaseFieldProps {
  modelValue?: string
  type?: 'text' | 'email' | 'password' | 'tel' | 'url'
  placeholder?: string
  hint?: string
}

const props = defineProps<UiTextFieldProps>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const UiTextField = resolveUiComponent('TextField')
</script>

<template>
  <component
    :is="UiTextField"
    v-bind="{ ...props, ...$attrs }"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <slot />
  </component>
</template>
