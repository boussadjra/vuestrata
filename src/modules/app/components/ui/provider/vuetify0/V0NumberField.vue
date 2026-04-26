<script setup lang="ts">
import { useBaseNumberField, type NumberFieldProps } from '@/components/ui/base'

const props = withDefaults(defineProps<NumberFieldProps>(), {
  size: 'md',
  step: 1,
})

defineEmits<{ 'update:modelValue': [value: number] }>()

const {
  inputProps,
  labelProps,
  errorMessageProps,
  descriptionProps,
  incrementButtonProps,
  decrementButtonProps,
  increment,
  decrement,
  displayError,
} = useBaseNumberField(props)
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <div class="relative">
      <button
        v-bind="decrementButtonProps"
        class="text-surface-400 hover:text-surface-600 absolute top-1/2 left-1 -translate-y-1/2 p-1"
        @click="decrement"
      >
        &minus;
      </button>
      <input
        v-bind="inputProps"
        class="w-full rounded border px-10 py-2 text-center text-sm focus:ring-2 focus:outline-none"
        data-ui="numberfield"
        data-provider="vuetify0"
      />
      <button
        v-bind="incrementButtonProps"
        class="text-surface-400 hover:text-surface-600 absolute top-1/2 right-1 -translate-y-1/2 p-1"
        @click="increment"
      >
        &plus;
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
