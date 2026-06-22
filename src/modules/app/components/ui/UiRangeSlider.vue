<script setup lang="ts">
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui'

import { useUiSlider, type SliderProps } from '@/composables/forms'

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

const emit = defineEmits<{
  'update:start': [value: number]
  'update:end': [value: number]
}>()

const { setValue, displayError, labelProps, errorMessageProps, descriptionProps } = useUiSlider({
  ...props,
  modelValue: props.start,
})

const isVertical = computed(() => props.orientation === 'vertical')

const sliderValues = computed(() => [props.start ?? props.min ?? 0, props.end ?? props.max ?? 100])

function onValueChange(values: number[] | undefined) {
  const nextStart = values?.[0] ?? props.min ?? 0
  const nextEnd = values?.[1] ?? props.max ?? 100

  setValue(nextStart)
  emit('update:start', nextStart)
  emit('update:end', nextEnd)
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

    <SliderRoot
      :model-value="sliderValues"
      :name="name"
      :disabled="disabled"
      :required="required"
      :min="min"
      :max="max"
      :step="step"
      :orientation="orientation"
      class="relative flex touch-none select-none"
      :class="isVertical ? 'h-40 flex-col items-center py-1' : 'w-full items-center py-3'"
      data-provider="reka"
      data-ui="range-slider"
      @update:model-value="onValueChange"
    >
      <SliderTrack
        class="bg-surface-200 dark:bg-surface-700 relative grow rounded-full"
        :class="isVertical ? 'h-full w-1.5' : 'h-1.5 w-full'"
      >
        <SliderRange
          class="bg-primary-500 absolute rounded-full"
          :class="isVertical ? 'w-full' : 'h-full'"
        />
      </SliderTrack>

      <SliderThumb
        class="bg-primary-500 focus:ring-primary-300 block h-4 w-4 rounded-full border-2 border-white shadow transition focus:ring-2 focus:outline-none"
      />
      <SliderThumb
        class="bg-primary-500 focus:ring-primary-300 block h-4 w-4 rounded-full border-2 border-white shadow transition focus:ring-2 focus:outline-none"
      />
    </SliderRoot>

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
