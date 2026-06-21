<script setup lang="ts">
import type { CheckboxProps } from '@/components/ui/base'
import BaseCheckboxField from '@/components/ui/base/BaseCheckboxField.vue'

withDefaults(defineProps<CheckboxProps>(), {
  modelValue: undefined,
  checked: undefined,
  trueValue: undefined,
  falseValue: undefined,
  indeterminate: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean | 'indeterminate']
  change: [value: boolean | 'indeterminate']
}>()

function forwardCheckboxValue(value: boolean | 'indeterminate') {
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<template>
  <BaseCheckboxField v-bind="$props" provider="reka" @update:model-value="forwardCheckboxValue" />
</template>
