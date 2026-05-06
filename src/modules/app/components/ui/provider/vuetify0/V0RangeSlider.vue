<script setup lang="ts">
import { useSliderThumb } from '@formwerk/core'

import { useBaseSlider, type SliderProps } from '@/components/ui/base'

export interface RangeSliderProps extends Omit<SliderProps, 'modelValue'> {
  start?: number
  end?: number
}

const props = withDefaults(defineProps<RangeSliderProps>(), {
  size: 'md',
  min: 0,
  max: 100,
  step: 1,
})

defineEmits<{ 'update:start': [value: number]; 'update:end': [value: number] }>()

const {
  groupProps,
  trackProps,
  trackEl,
  useThumbMetadata,
  displayError,
  labelProps,
  errorMessageProps,
  descriptionProps,
} = useBaseSlider({
  ...props,
  modelValue: props.start,
})

const thumbStartEl = ref<HTMLElement>(null!)
const thumbEndEl = ref<HTMLElement>(null!)
const {
  thumbProps: thumbStartProps,
  currentValue: startValue,
  isDragging: isDraggingStart,
} = useSliderThumb({ label: 'Start', modelValue: () => props.start }, thumbStartEl)
const {
  thumbProps: thumbEndProps,
  currentValue: endValue,
  isDragging: isDraggingEnd,
} = useSliderThumb({ label: 'End', modelValue: () => props.end }, thumbEndEl)

const startMeta = useThumbMetadata(0)
const endMeta = useThumbMetadata(1)
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

    <div v-bind="groupProps" class="relative py-3" data-provider="vuetify0" data-ui="range-slider">
      <div
        ref="trackEl"
        v-bind="trackProps"
        class="bg-surface-200 dark:bg-surface-700 relative h-1.5 cursor-pointer rounded-full"
      >
        <div
          class="bg-primary-500 absolute h-full"
          :style="{
            left: `${startMeta?.percent ?? 0}%`,
            width: `${(endMeta?.percent ?? 100) - (startMeta?.percent ?? 0)}%`,
          }"
        />
        <div
          ref="thumbStartEl"
          v-bind="thumbStartProps"
          class="bg-primary-500 focus:ring-primary-300 absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white shadow focus:ring-2"
          :class="{ 'cursor-grabbing': isDraggingStart }"
          :style="{ left: `${startMeta?.percent ?? 0}%` }"
        />
        <div
          ref="thumbEndEl"
          v-bind="thumbEndProps"
          class="bg-primary-500 focus:ring-primary-300 absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white shadow focus:ring-2"
          :class="{ 'cursor-grabbing': isDraggingEnd }"
          :style="{ left: `${endMeta?.percent ?? 100}%` }"
        />
      </div>
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
