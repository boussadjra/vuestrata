<script setup lang="ts">
import { useSliderThumb } from '@formwerk/core'

import { useBaseSlider, type SliderProps } from '@/components/ui/base'

const props = withDefaults(defineProps<SliderProps & { provider: 'reka' }>(), {
  size: 'md',
  min: 0,
  max: 100,
  step: 1,
})

defineEmits<{ 'update:modelValue': [value: number] }>()

const {
  groupProps,
  trackProps,
  trackEl,
  outputProps,
  useThumbMetadata,
  displayError,
  labelProps,
  errorMessageProps,
  descriptionProps,
} = useBaseSlider(props)

const thumbEl = ref<HTMLElement>(null!)
const { thumbProps, currentValue, currentText, isDragging } = useSliderThumb(
  { label: props.label ?? '' },
  thumbEl,
)
const thumbMeta = useThumbMetadata(0)
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

    <div v-bind="groupProps" class="relative py-3" :data-provider="provider" data-ui="slider">
      <div
        ref="trackEl"
        v-bind="trackProps"
        class="bg-surface-200 dark:bg-surface-700 relative h-1.5 cursor-pointer rounded-full"
      >
        <div
          class="bg-primary-500 absolute h-full rounded-full"
          :style="{ width: `${thumbMeta?.percent ?? 0}%` }"
        />
        <div
          ref="thumbEl"
          v-bind="thumbProps"
          class="bg-primary-500 focus:ring-primary-300 absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white shadow focus:ring-2"
          :class="{ 'cursor-grabbing': isDragging, 'cursor-not-allowed opacity-50': disabled }"
          :style="{ left: `${thumbMeta?.percent ?? 0}%` }"
        />
      </div>
    </div>

    <output v-bind="outputProps as Record<string, unknown>" class="text-surface-500 text-xs">
      {{ currentText || currentValue }}
    </output>

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
