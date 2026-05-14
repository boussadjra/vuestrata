<script setup lang="ts">
import type { CheckboxProps } from '@/components/ui/base'
import BaseCheckboxField from '@/components/ui/base/BaseCheckboxField.vue'

withDefaults(defineProps<CheckboxProps>(), {
  modelValue: undefined,
  trueValue: undefined,
  falseValue: undefined,
  indeterminate: undefined,
})
</script>

<template>
  <BaseCheckboxField v-bind="$props" provider="reka" />
</template>
