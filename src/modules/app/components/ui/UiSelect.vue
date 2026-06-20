<script setup lang="ts">
import type { SelectProps } from '@/composables/forms/useBaseSelect'
import { resolveUiComponent } from '@/config/ui-provider'

const UiSelect = resolveUiComponent('Select')

defineProps<SelectProps>()

defineEmits<{ 'update:modelValue': [value: string | number | Array<string | number>] }>()

defineOptions({
  inheritAttrs: false,
})
</script>

<template>
  <component
    :is="UiSelect"
    v-bind="{ ...$props, ...$attrs }"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <slot />
  </component>
</template>
