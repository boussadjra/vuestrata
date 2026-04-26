<script setup lang="ts">
import { useBaseOTPField, type OTPFieldProps } from '@/components/ui/base'

const props = withDefaults(defineProps<OTPFieldProps>(), { length: 6, accept: 'numeric' })
defineEmits<{ 'update:modelValue': [value: string] }>()

const { slots, labelProps, errorMessageProps, descriptionProps, displayError } =
  useBaseOTPField(props)
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <div class="flex gap-2" data-provider="vuetify0" data-ui="otp-field">
      <template v-for="(slot, index) in slots" :key="index">
        <input v-bind="slot" class="h-12 w-10 rounded border text-center font-mono text-lg" />
      </template>
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
