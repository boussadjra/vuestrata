<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'
import type { BaseFieldProps } from '@/types'

export interface UiSwitchProps extends Omit<BaseFieldProps, 'size'> {
  modelValue?: boolean
  size?: 'sm' | 'md' | 'lg'
}

defineProps<UiSwitchProps>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()

const UiSwitch = resolveUiComponent('Switch')
</script>

<template>
  <component :is="UiSwitch" v-bind="$attrs">
    <slot />
  </component>
</template>
