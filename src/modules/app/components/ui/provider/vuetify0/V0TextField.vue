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
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <input
      v-bind="inputProps"
      :type="type"
      class="w-full rounded border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
      data-ui="textfield"
      data-provider="vuetify0"
    />
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
