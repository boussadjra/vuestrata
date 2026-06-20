<script setup lang="ts">
import type { BaseButtonProps } from '@/components/ui/base/BaseButton.vue'
import { resolveUiComponent } from '@/config/ui-provider'

export interface UiButtonProps extends Omit<BaseButtonProps, 'provider'> {}

defineProps<UiButtonProps>()
defineEmits<{ click: [event: MouseEvent] }>()
const UiButton = resolveUiComponent('Button')
</script>

<template>
  <component :is="UiButton" v-bind="{ ...$props, ...$attrs }" @click="$emit('click', $event)">
    <slot />
  </component>
</template>
