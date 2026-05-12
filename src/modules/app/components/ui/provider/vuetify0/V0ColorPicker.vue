<script setup lang="ts">
import type { ColorPickerProps } from '@/components/ui/base'
import BaseColorPickerField from '@/components/ui/base/BaseColorPickerField.vue'

const props = withDefaults(defineProps<ColorPickerProps>(), { size: 'md', format: 'hex' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <BaseColorPickerField
    v-bind="props"
    provider="vuetify0"
    @update:modelValue="emit('update:modelValue', $event)"
  />
</template>
