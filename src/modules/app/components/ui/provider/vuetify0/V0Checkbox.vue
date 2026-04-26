<script setup lang="ts">
import { useBaseCheckbox, type CheckboxProps } from '@/components/ui/base'

const props = withDefaults(defineProps<CheckboxProps>(), {
  size: 'md',
})

defineEmits<{ 'update:modelValue': [value: boolean | 'indeterminate'] }>()

const { inputProps, labelProps, isChecked, toggle, errorMessageProps, displayError } =
  useBaseCheckbox(props)

const sizeMap: Record<string, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="inline-flex items-center gap-2">
      <span
        v-bind="inputProps"
        role="checkbox"
        tabindex="0"
        :class="[
          'inline-flex items-center justify-center rounded border-2 transition-colors',
          isChecked ? 'bg-primary-500 border-primary-500 text-white' : 'border-surface-300',
          sizeMap[size],
        ]"
        data-ui="checkbox"
        data-provider="vuetify0"
        @click="toggle()"
        @keydown.space.prevent="toggle()"
      >
        <span v-if="isChecked" class="text-xs">&#10003;</span>
      </span>
      <label v-if="label" v-bind="labelProps" class="cursor-pointer text-sm select-none">
        {{ label }}
      </label>
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
  </div>
</template>
