<script setup lang="ts">
import type { ToggleGroupProps } from '@/components/ui/base'
import BaseToggleGroupField from '@/components/ui/base/BaseToggleGroupField.vue'

defineProps<ToggleGroupProps>()
defineEmits<{ 'update:modelValue': [value: string | string[]] }>()
</script>

<template>
  <BaseToggleGroupField
    v-bind="$props"
    provider="reka"
    @update:modelValue="$emit('update:modelValue', $event)"
  />
</template>
