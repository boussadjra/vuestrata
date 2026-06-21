<script setup lang="ts">
import BaseSheetPanel from '@/components/ui/base/BaseSheetPanel.vue'

export interface SheetProps {
  modelValue?: boolean
  side?: 'left' | 'right' | 'top' | 'bottom'
  title?: string
  description?: string
}

withDefaults(defineProps<SheetProps>(), {
  modelValue: false,
  side: 'right',
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <BaseSheetPanel
    v-bind="$props"
    provider="reka"
    @update:modelValue="emit('update:modelValue', $event)"
  />
</template>
