<script setup lang="ts">
import { useBaseColorPicker, type ColorPickerProps } from '@/components/ui/base'

const props = withDefaults(defineProps<ColorPickerProps>(), { size: 'md', format: 'hex' })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { fieldValue, setValue, labelProps, errorMessageProps, descriptionProps, displayError } =
  useBaseColorPicker(props)

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  setValue(target.value)
  emit('update:modelValue', target.value)
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">{{ label }}</label>
    <input
      type="color"
      :value="fieldValue ?? '#000000'"
      :disabled="disabled"
      class="h-10 w-10 rounded border p-0.5"
      data-ui="color-picker"
      data-provider="vuetify0"
      @input="onInput"
    />
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
