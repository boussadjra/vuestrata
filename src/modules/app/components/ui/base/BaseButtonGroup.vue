<script setup lang="ts">
import { Button } from '@vuetify/v0'

import type { ButtonGroupItemValue, ButtonGroupModelValue } from './button-group.types'

export interface BaseButtonGroupProps {
  provider: 'reka' | 'vuetify0'
  modelValue?: ButtonGroupModelValue
  multiple?: boolean
  deselectable?: boolean
  ariaLabel?: string
}

const props = defineProps<BaseButtonGroupProps>()
const emit = defineEmits<{ 'update:modelValue': [value: ButtonGroupModelValue] }>()

const updateValue = (val: ButtonGroupItemValue) => {
  if (props.multiple) {
    const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    const index = current.indexOf(val)
    if (index > -1) {
      current.splice(index, 1)
    } else {
      current.push(val)
    }
    emit('update:modelValue', current)
  } else {
    emit('update:modelValue', props.deselectable && props.modelValue === val ? undefined : val)
  }
}

provide(props.provider === 'vuetify0' ? 'v0-button-group' : 'reka-button-group', {
  modelValue: computed(() => props.modelValue),
  updateValue,
})
</script>

<template>
  <Button.Group
    v-if="provider === 'vuetify0'"
    :model-value="modelValue"
    :multiple="multiple"
    :mandatory="!deselectable ? 'force' : false"
    class="border-surface-200 dark:border-surface-700 [&>[data-ui=button]]:border-surface-200 dark:[&>[data-ui=button]]:border-surface-700 inline-flex rounded-lg border shadow-sm [&>[data-ui=button]]:relative [&>[data-ui=button]]:!rounded-none [&>[data-ui=button]]:border-x first:[&>[data-ui=button]]:!rounded-s-lg last:[&>[data-ui=button]]:!rounded-e-lg hover:[&>[data-ui=button]]:z-10 focus-visible:[&>[data-ui=button]]:z-20 active:[&>[data-ui=button]]:z-20 [&>[data-ui=button]:not(:first-child)]:-ms-px"
    data-provider="vuetify0"
    role="group"
    :aria-label="ariaLabel"
    @update:model-value="(v: ButtonGroupModelValue) => emit('update:modelValue', v)"
  >
    <slot />
  </Button.Group>

  <div
    v-else
    class="border-surface-200 dark:border-surface-700 [&>[data-ui=button]]:border-surface-200 dark:[&>[data-ui=button]]:border-surface-700 inline-flex rounded-lg border shadow-sm [&>[data-ui=button]]:relative [&>[data-ui=button]]:!rounded-none [&>[data-ui=button]]:border-x first:[&>[data-ui=button]]:!rounded-s-lg last:[&>[data-ui=button]]:!rounded-e-lg hover:[&>[data-ui=button]]:z-10 focus-visible:[&>[data-ui=button]]:z-20 active:[&>[data-ui=button]]:z-20 [&>[data-ui=button]:not(:first-child)]:-ms-px"
    data-provider="reka"
    role="group"
    :aria-label="ariaLabel"
  >
    <slot />
  </div>
</template>
