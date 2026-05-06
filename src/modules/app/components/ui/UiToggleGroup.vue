<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'
import type { BaseFieldProps } from '@/types'

export interface ToggleGroupOption {
  label: string
  value: string
  disabled?: boolean
}

export interface UiToggleGroupProps extends Omit<BaseFieldProps, 'size'> {
  modelValue?: string | string[]
  options: ToggleGroupOption[]
  multiple?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const props = defineProps<UiToggleGroupProps>()
const emit = defineEmits<{ 'update:modelValue': [value: string | string[]] }>()

const UiToggleGroup = resolveUiComponent('ToggleGroup')
</script>

<template>
  <component
    :is="UiToggleGroup"
    v-bind="{ ...props, ...$attrs }"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <slot />
  </component>
</template>
