<script setup lang="ts">
import { useBaseSearchField, type SearchFieldProps } from '@/components/ui/base'

const props = withDefaults(defineProps<SearchFieldProps>(), {
  size: 'md',
  clearButtonLabel: 'Clear',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: [value: string]
  clear: []
}>()

const {
  inputProps,
  labelProps,
  clearBtnProps,
  errorMessageProps,
  descriptionProps,
  model,
  displayError,
} = useBaseSearchField(props, (value) => emit('search', value))
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <div class="relative">
      <input
        v-bind="inputProps"
        type="search"
        class="w-full rounded border px-3 py-2 pr-8 text-sm focus:ring-2 focus:outline-none"
        data-ui="searchfield"
        data-provider="vuetify0"
      />
      <button
        v-if="model"
        v-bind="clearBtnProps"
        class="text-surface-400 hover:text-surface-600 absolute top-1/2 right-2 -translate-y-1/2"
        @click="emit('clear')"
      >
        &#10005;
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
