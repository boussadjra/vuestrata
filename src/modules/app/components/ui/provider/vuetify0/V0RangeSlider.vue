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
} = useBaseSlider({ ...props, modelValue: props.start })

const thumbStartEl = ref<HTMLElement>(null!)
const thumbEndEl = ref<HTMLElement>(null!)
const { thumbProps: thumbStartProps } = useSliderThumb({ label: 'Start' }, thumbStartEl)
const { thumbProps: thumbEndProps } = useSliderThumb({ label: 'End' }, thumbEndEl)
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">{{ label }}</label>
    <div v-bind="groupProps" class="relative py-3" data-provider="vuetify0" data-ui="range-slider">
      <div
        ref="trackEl"
        v-bind="trackProps"
        class="bg-surface-200 dark:bg-surface-700 relative h-1.5 rounded-full"
      >
        <div
          ref="thumbStartEl"
          v-bind="thumbStartProps"
          class="bg-primary-500 absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white shadow"
        />
        <div
          ref="thumbEndEl"
          v-bind="thumbEndProps"
          class="bg-primary-500 absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white shadow"
        />
      </div>
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
