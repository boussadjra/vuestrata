<script setup lang="ts">
import {
  ColorAreaArea,
  ColorAreaRoot,
  ColorAreaThumb,
  ColorFieldInput,
  ColorFieldRoot,
  ColorSliderRoot,
  ColorSliderThumb,
  ColorSliderTrack,
  ColorSwatchPickerItem,
  ColorSwatchPickerItemIndicator,
  ColorSwatchPickerItemSwatch,
  ColorSwatchPickerRoot,
} from 'reka-ui'

import { useUiColorPicker, type ColorPickerProps } from '@/composables/forms'

export interface ColorPickerFieldProps extends ColorPickerProps {
  provider?: 'reka'
}

const props = withDefaults(defineProps<ColorPickerFieldProps>(), {
  provider: 'reka',
  size: 'md',
  format: 'hex',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { fieldValue, setValue, labelProps, errorMessageProps, descriptionProps, displayError } =
  useUiColorPicker(props)

const colorValue = computed({
  get: () => {
    const candidate =
      typeof fieldValue.value === 'string' && fieldValue.value ? fieldValue.value : props.modelValue

    return candidate || '#000000'
  },
  set: (value: string) => {
    setValue(value)
    emit('update:modelValue', value)
  },
})

const colorSpace = computed(() => (props.format === 'rgb' ? 'rgb' : 'hsl'))

const thumbClasses =
  'block h-4 w-4 rounded-full border-2 border-white shadow outline-none ring-2 ring-black/10'

const sliderThumbClasses =
  'block h-4 w-4 rounded-full border-2 border-white shadow outline-none ring-2 ring-black/10'

const fieldClasses = computed(() => [
  'shaped-border shaped-radius-sm w-full border px-3 py-2 font-mono text-sm outline-none',
  'bg-white text-surface-700 dark:bg-surface-800 dark:text-surface-200',
  displayError.value
    ? 'border-red-400 dark:border-red-500'
    : 'border-surface-300 dark:border-surface-600 focus:ring-primary-300 focus:ring-2',
])

const swatchClasses =
  'relative h-7 w-7 overflow-hidden rounded-full border border-surface-300 dark:border-surface-600'

const swatchIndicatorClasses =
  'absolute inset-0 flex items-center justify-center bg-black/35 text-xs text-white'

function swatchLabel(color: string) {
  return color.toUpperCase()
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

    <div class="flex flex-col gap-3" data-ui="color-picker" :data-provider="provider">
      <ColorAreaRoot
        v-slot="{ style }"
        v-model="colorValue"
        :disabled="disabled"
        :required="required"
        :name="name"
        color-space="hsl"
        x-channel="saturation"
        y-channel="lightness"
      >
        <ColorAreaArea
          :style="style"
          class="shaped-radius border-surface-300 dark:border-surface-600 relative h-36 w-full overflow-hidden rounded-lg border"
        >
          <ColorAreaThumb :class="thumbClasses" />
        </ColorAreaArea>
      </ColorAreaRoot>

      <ColorSliderRoot
        v-model="colorValue"
        :disabled="disabled"
        channel="hue"
        :color-space="colorSpace"
        class="flex items-center"
      >
        <ColorSliderTrack class="h-3 w-full rounded-full" />
        <ColorSliderThumb :class="sliderThumbClasses" />
      </ColorSliderRoot>

      <ColorFieldRoot
        v-model="colorValue"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :name="name"
      >
        <ColorFieldInput :class="fieldClasses" />
      </ColorFieldRoot>

      <ColorSwatchPickerRoot
        v-if="swatches?.length"
        v-model="colorValue"
        class="flex flex-wrap gap-2"
      >
        <ColorSwatchPickerItem
          v-for="color in swatches"
          :key="color"
          :value="color"
          :class="swatchClasses"
        >
          <ColorSwatchPickerItemSwatch class="h-full w-full" :label="swatchLabel(color)" />
          <ColorSwatchPickerItemIndicator :class="swatchIndicatorClasses"
            >✓</ColorSwatchPickerItemIndicator
          >
        </ColorSwatchPickerItem>
      </ColorSwatchPickerRoot>
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
