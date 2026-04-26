<script setup lang="ts">
export interface ButtonGroupProps {
  modelValue?: any
  multiple?: boolean
  deselectable?: boolean
  ariaLabel?: string
}

const props = defineProps<ButtonGroupProps>()
const emit = defineEmits<{ 'update:modelValue': [value: any] }>()

const updateValue = (val: any) => {
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

provide('reka-button-group', {
  modelValue: computed(() => props.modelValue),
  updateValue,
})
</script>

<template>
  <div
    class="border-surface-200 dark:border-surface-700 [&>[data-ui=button]]:border-surface-200 dark:[&>[data-ui=button]]:border-surface-700 inline-flex rounded-lg border shadow-sm [&>[data-ui=button]]:relative [&>[data-ui=button]]:!rounded-none [&>[data-ui=button]]:border-x first:[&>[data-ui=button]]:!rounded-s-lg last:[&>[data-ui=button]]:!rounded-e-lg hover:[&>[data-ui=button]]:z-10 focus-visible:[&>[data-ui=button]]:z-20 active:[&>[data-ui=button]]:z-20 [&>[data-ui=button]:not(:first-child)]:-ms-px"
    data-provider="reka"
    role="group"
    :aria-label="ariaLabel"
  >
    <slot />
  </div>
</template>
