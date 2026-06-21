<script setup lang="ts">
import type { RatingFieldProps } from '@/components/ui/base'
import BaseRatingField from '@/components/ui/base/BaseRatingField.vue'

const props = withDefaults(defineProps<RatingFieldProps>(), {
  size: 'md',
  max: 5,
})

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>

<template>
  <BaseRatingField
    v-bind="props"
    provider="reka"
    @update:modelValue="emit('update:modelValue', $event)"
  />
</template>
