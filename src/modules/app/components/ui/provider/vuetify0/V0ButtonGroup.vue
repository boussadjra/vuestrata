<script setup lang="ts">
import { Button } from '@vuetify/v0'

export interface ButtonGroupProps {
  modelValue?: any
  multiple?: boolean
  deselectable?: boolean
  ariaLabel?: string
}

const props = defineProps<ButtonGroupProps>()
const emit = defineEmits<{ 'update:modelValue': [value: any] }>()

provide('v0-button-group', {
  modelValue: computed(() => props.modelValue),
})
</script>

<template>
  <Button.Group
    :model-value="modelValue"
    :multiple="multiple"
    :mandatory="!deselectable ? 'force' : false"
    class="border-surface-200 dark:border-surface-700 [&>[data-ui=button]]:border-surface-200 dark:[&>[data-ui=button]]:border-surface-700 inline-flex rounded-lg border shadow-sm [&>[data-ui=button]]:relative [&>[data-ui=button]]:!rounded-none [&>[data-ui=button]]:border-x first:[&>[data-ui=button]]:!rounded-s-lg last:[&>[data-ui=button]]:!rounded-e-lg hover:[&>[data-ui=button]]:z-10 focus-visible:[&>[data-ui=button]]:z-20 active:[&>[data-ui=button]]:z-20 [&>[data-ui=button]:not(:first-child)]:-ms-px"
    data-provider="vuetify0"
    role="group"
    :aria-label="ariaLabel"
    @update:model-value="(v: any) => emit('update:modelValue', v)"
  >
    <slot />
  </Button.Group>
</template>
