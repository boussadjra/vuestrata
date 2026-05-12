<script setup lang="ts">
import type { ComboBoxProps } from '@/components/ui/base'
import BaseComboBoxField from '@/components/ui/base/BaseComboBoxField.vue'

import V0Option from './V0Option.vue'

const props = withDefaults(defineProps<ComboBoxProps>(), {
  placeholder: 'Search...',
  size: 'md',
})

defineEmits<{ 'update:modelValue': [value: string | string[]] }>()
</script>

<template>
  <BaseComboBoxField v-bind="props" provider="vuetify0" :option-component="V0Option" />
</template>
