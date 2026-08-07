<script setup lang="ts">
import { PinInputInput, PinInputRoot } from 'reka-ui'

import { useUiOtpField, type OTPFieldProps } from '@/composables/forms'

const props = withDefaults(
  defineProps<OTPFieldProps & { provider?: 'reka'; modelValue?: string }>(),
  {
    provider: 'reka',
    length: 6,
    accept: 'numeric',
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { labelProps, errorMessageProps, descriptionProps, displayError } = useUiOtpField(props)

const pinValue = computed(() => (props.modelValue ? props.modelValue.split('') : []))

function onPinUpdate(value: string[]) {
  emit('update:modelValue', value.join(''))
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-foreground text-sm font-medium">
      {{ label }}
      <span v-if="required" class="text-destructive ms-0.5">*</span>
    </label>

    <PinInputRoot
      :model-value="pinValue"
      :name="name"
      :disabled="disabled"
      :required="required"
      :otp="accept === 'numeric'"
      :type="accept === 'numeric' ? 'number' : 'text'"
      class="flex gap-2"
      :data-provider="provider"
      data-ui="otp-field"
      @update:model-value="onPinUpdate"
    >
      <template v-for="index in length" :key="index">
        <PinInputInput
          :index="index - 1"
          :class="[
            'h-12 w-10 rounded-lg border text-center font-mono text-lg transition-colors',
            'dark:bg-surface-800 text-foreground bg-white',
            'focus:ring-primary-300 focus:ring-2 focus:outline-none',
            displayError ? 'border-destructive' : 'border-surface-300 dark:border-surface-600',
            disabled ? 'cursor-not-allowed opacity-50' : '',
          ]"
        />
      </template>
    </PinInputRoot>

    <p v-if="displayError" v-bind="errorMessageProps" class="text-destructive text-xs" role="alert">
      {{ displayError }}
    </p>
    <p
      v-else-if="hint || description"
      v-bind="descriptionProps"
      class="text-muted-foreground text-xs"
    >
      {{ hint || description }}
    </p>
  </div>
</template>
