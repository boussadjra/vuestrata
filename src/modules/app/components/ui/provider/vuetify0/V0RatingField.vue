<script setup lang="ts">
import { useBaseRatingField, type RatingFieldProps } from '@/components/ui/base'

const props = withDefaults(defineProps<RatingFieldProps>(), { size: 'md', max: 5 })

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

function onStarClick(star: number) {
  setRating(star)
  emit('update:modelValue', star)
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">{{ label }}</label>
    <div class="flex gap-0.5" data-provider="vuetify0" data-ui="rating" role="radiogroup">
      <button
        v-for="star in maxStars"
        :key="star"
        type="button"
        class="text-xl"
        :class="{
          'text-yellow-400': star <= (hoveredStar || (fieldValue ?? 0)),
          'text-surface-300': star > (hoveredStar || (fieldValue ?? 0)),
        }"
        :disabled="disabled"
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
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
