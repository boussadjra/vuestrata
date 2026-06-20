<script setup lang="ts">
import BaseButtonGroup from '@/components/ui/base/BaseButtonGroup.vue'
import type { BaseButtonGroupProps } from '@/components/ui/base/BaseButtonGroup.vue'
import type { ButtonGroupModelValue } from '@/components/ui/base/button-group.types'

export interface ButtonGroupProps extends Omit<BaseButtonGroupProps, 'provider'> {}

defineProps<ButtonGroupProps>()
defineEmits<{ 'update:modelValue': [value: ButtonGroupModelValue] }>()
</script>

<template>
  <BaseButtonGroup
    v-bind="$props"
    provider="vuetify0"
    @update:modelValue="$emit('update:modelValue', $event)"
  >
    <slot />
  </BaseButtonGroup>
</template>
