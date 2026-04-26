<script setup lang="ts">
import { resolveUiComponent } from '@/config/ui-provider'
import type { BaseFieldProps } from '@/types'

export interface UiSearchFieldProps extends BaseFieldProps {
  modelValue?: string
  placeholder?: string
  hint?: string
  clearButtonLabel?: string
}

defineProps<UiSearchFieldProps>()
defineEmits<{
  'update:modelValue': [value: string]
  search: [value: string]
  clear: []
}>()

const UiSearchField = resolveUiComponent('SearchField')
</script>

<template>
  <component :is="UiSearchField" v-bind="$attrs">
    <slot />
  </component>
</template>
