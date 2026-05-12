<script setup lang="ts">
import { useBaseColorPicker, type ColorPickerProps } from '@/components/ui/base'

export interface BaseColorPickerFieldProps extends ColorPickerProps {
  provider: 'reka' | 'vuetify0'
}

const props = withDefaults(defineProps<BaseColorPickerFieldProps>(), {
  size: 'md',
  format: 'hex',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { fieldValue, setValue, labelProps, errorMessageProps, descriptionProps, displayError } =
  useBaseColorPicker(props)

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  setValue(target.value)
  emit('update:modelValue', target.value)
}

function onSwatchClick(color: string) {
  setValue(color)
  emit('update:modelValue', color)
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label
      v-if="label"
      v-bind="labelProps"
      class="text-surface-700 dark:text-surface-300 text-sm font-medium"
    >
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>

    <div class="flex items-center gap-2" data-ui="color-picker" :data-provider="provider">
      <input
        type="color"
        :value="fieldValue ?? '#000000'"
        :disabled="disabled"
        class="border-surface-300 dark:border-surface-600 h-10 w-10 cursor-pointer rounded border p-0.5"
        @input="onInput"
      />
      <span class="text-surface-600 dark:text-surface-400 font-mono text-sm">{{ fieldValue }}</span>
    </div>

    <div v-if="swatches?.length" class="mt-1 flex gap-1">
      <button
        v-for="color in swatches"
        :key="color"
        type="button"
        class="border-surface-300 dark:border-surface-600 h-6 w-6 rounded border"
        :class="{ 'ring-primary-500 ring-2': fieldValue === color }"
        :style="{ backgroundColor: color }"
        :disabled="disabled"
        @click="onSwatchClick(color)"
      />
    </div>

    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p
      v-else-if="hint || description"
      v-bind="descriptionProps"
      class="text-surface-500 dark:text-surface-400 text-xs"
    >
      {{ hint || description }}
    </p>
  </div>
</template>
