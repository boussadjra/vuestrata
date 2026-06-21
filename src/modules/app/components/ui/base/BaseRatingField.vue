<script setup lang="ts">
import { useBaseRatingField, type RatingFieldProps } from '@/components/ui/base'

export interface BaseRatingFieldProps extends RatingFieldProps {
  provider: 'reka'
}

const props = withDefaults(defineProps<BaseRatingFieldProps>(), {
  size: 'md',
  max: 5,
})

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const {
  fieldValue,
  setRating,
  maxStars,
  labelProps,
  errorMessageProps,
  descriptionProps,
  displayError,
} = useBaseRatingField(props)

const hoveredStar = ref(0)

const descriptionClass = computed(() => {
  return props.provider === 'reka'
    ? 'text-surface-500 dark:text-surface-400 text-xs'
    : 'text-surface-500 text-xs'
})

function onStarClick(star: number) {
  setRating(star)
  emit('update:modelValue', star)
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

    <div
      class="flex items-center gap-0.5"
      :data-provider="provider"
      data-ui="rating"
      role="radiogroup"
      :aria-label="label"
    >
      <button
        v-for="star in maxStars"
        :key="star"
        type="button"
        class="text-xl transition-colors focus:outline-none"
        :class="{
          'text-yellow-400': star <= (hoveredStar || (fieldValue ?? 0)),
          'text-surface-300 dark:text-surface-600': star > (hoveredStar || (fieldValue ?? 0)),
          'cursor-not-allowed opacity-50': disabled,
          'cursor-pointer': !disabled,
        }"
        :disabled="disabled"
        :aria-label="`${star} star${star > 1 ? 's' : ''}`"
        @click="onStarClick(star)"
        @mouseenter="hoveredStar = star"
        @mouseleave="hoveredStar = 0"
      >
        ★
      </button>
    </div>

    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" :class="descriptionClass">
      {{ hint || description }}
    </p>
  </div>
</template>
