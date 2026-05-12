<script setup lang="ts">
import BaseButtonGroup from '@/components/ui/base/BaseButtonGroup.vue'
import type { BaseButtonGroupProps } from '@/components/ui/base/BaseButtonGroup.vue'

export interface ButtonGroupProps extends Omit<BaseButtonGroupProps, 'provider'> {}

defineProps<ButtonGroupProps>()
defineEmits<{ 'update:modelValue': [value: any] }>()
</script>

<template>
  <BaseButtonGroup
    v-bind="$props"
    provider="reka"
    @update:modelValue="$emit('update:modelValue', $event)"
  >
    <slot />
  </BaseButtonGroup>
</template>
