<script setup lang="ts">
import { useBaseTextField, type TextFieldProps } from '@/components/ui/base'

const props = withDefaults(defineProps<TextFieldProps>(), {
  type: 'text',
  size: 'md',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { inputProps, labelProps, errorMessageProps, descriptionProps, displayError, fieldValue } =
  useBaseTextField(props)

watch(fieldValue, (value) => {
  const nextValue = value ?? ''
  if (nextValue !== props.modelValue) emit('update:modelValue', nextValue)
})

const sizeClasses: Record<string, string> = {
  xs: 'px-2 py-1 text-xs',
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-3 text-base',
}

const inputClasses = computed(() => [
  'w-full rounded-lg border bg-white text-surface-700 dark:bg-surface-800 dark:text-surface-200 transition-colors',
  'placeholder:text-surface-400 dark:placeholder:text-surface-500',
  'focus:outline-none focus:ring-2 focus:ring-offset-0',
  displayError.value
    ? 'border-red-400 focus:ring-red-300 dark:border-red-500'
    : 'border-surface-300 dark:border-surface-600 focus:ring-primary-300 focus:border-primary-400',
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-50 dark:disabled:bg-surface-900',
  sizeClasses[props.size ?? 'md'],
])
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
    <input
      v-bind="inputProps"
      :type="type"
      :class="inputClasses"
      data-provider="vuetify0"
      data-ui="textfield"
    />
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
