<script setup lang="ts">
import type { ComboBoxProps } from '@/components/ui/base'
import BaseComboBoxField from '@/components/ui/base/BaseComboBoxField.vue'

import RekaOption from './UiOption.vue'

const props = withDefaults(defineProps<ComboBoxProps>(), {
  placeholder: 'Search...',
  size: 'md',
})

defineEmits<{ 'update:modelValue': [value: string | string[]] }>()
</script>

<template>
  <BaseComboBoxField v-bind="props" provider="reka" :option-component="RekaOption" />
</template>
