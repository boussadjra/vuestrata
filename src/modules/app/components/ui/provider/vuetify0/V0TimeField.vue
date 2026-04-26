<script setup lang="ts">
import { DateTimeSegment } from '@formwerk/core'

import { useBaseTimeField, type TimeFieldProps } from '@/components/ui/base'

const props = withDefaults(defineProps<TimeFieldProps>(), { size: 'md' })

defineEmits<{ 'update:modelValue': [value: string] }>()

const { controlProps, segments, labelProps, errorMessageProps, descriptionProps, displayError } =
  useBaseTimeField(props)
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <div
      v-bind="controlProps"
      class="flex items-center gap-0.5 rounded border px-3 py-2 text-sm"
      data-ui="time-field"
      data-provider="vuetify0"
    >
      <DateTimeSegment v-for="seg in segments" :key="seg.type" v-bind="seg" />
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
