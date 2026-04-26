<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'
import type { BaseFieldProps } from '@/types'

export interface UiToggleProps extends Omit<BaseFieldProps, 'size'> {
  modelValue?: boolean
  size?: 'sm' | 'md' | 'lg'
}

defineProps<UiToggleProps>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()

const UiToggle = resolveUiComponent('Toggle')
</script>

<template>
  <component :is="UiToggle" v-bind="$attrs">
    <slot />
  </component>
</template>
