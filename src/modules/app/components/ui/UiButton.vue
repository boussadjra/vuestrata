<script setup lang="ts">
import BaseButton from '@/components/ui/base/BaseButton.vue'
import type { BaseButtonProps } from '@/components/ui/base/BaseButton.vue'

export interface ButtonProps extends Omit<BaseButtonProps, 'provider'> {}

defineProps<ButtonProps>()
defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <BaseButton v-bind="$props" provider="reka" @click="$emit('click', $event)">
    <slot />
  </BaseButton>
</template>
