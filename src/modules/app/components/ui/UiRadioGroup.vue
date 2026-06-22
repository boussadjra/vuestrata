<script setup lang="ts">
import { RadioGroupIndicator, RadioGroupItem, RadioGroupRoot } from 'reka-ui'

import { useUiRadioGroup, type RadioGroupProps } from '@/composables/forms'

const props = withDefaults(
  defineProps<
    RadioGroupProps & {
      provider?: 'reka'
    }
  >(),
  {
    provider: 'reka',
    orientation: 'vertical',
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { groupProps, labelProps, errorMessageProps, descriptionProps, displayError, fieldValue } =
  useUiRadioGroup(props)

const labelClass = 'text-surface-700 dark:text-surface-300 text-sm font-medium'

watch(
  () => fieldValue.value,
  (newValue) => {
    if (typeof newValue === 'string' && newValue !== props.modelValue) {
      emit('update:modelValue', newValue)
    }
  },
)
</script>

<template>
  <div class="flex flex-col gap-2" data-provider="reka" data-ui="radiogroup">
    <div v-if="label" v-bind="labelProps" :class="labelClass">
      {{ label }}
    </div>

    <RadioGroupRoot
      v-bind="groupProps"
      :class="orientation === 'horizontal' ? 'flex flex-wrap gap-3' : 'space-y-2'"
    >
      <label
        v-for="option in options"
        :key="option.value"
        class="inline-flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors"
        :class="
          modelValue === option.value
            ? 'border-primary-400 bg-primary-50 dark:border-primary-600 dark:bg-primary-900/25'
            : 'border-surface-200 dark:border-surface-700'
        "
      >
        <RadioGroupItem
          :value="option.value"
          :disabled="option.disabled || disabled"
          class="border-surface-400 text-primary-700 data-[state=checked]:border-primary-700 data-[state=checked]:bg-primary-700 dark:border-surface-500 dark:data-[state=checked]:border-primary-500 dark:data-[state=checked]:bg-primary-500 mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border outline-none dark:text-white"
        >
          <RadioGroupIndicator class="block h-2 w-2 rounded-full bg-white" />
        </RadioGroupItem>
        <span class="flex min-w-0 flex-col">
          <span class="text-surface-700 dark:text-surface-300 text-sm">{{ option.label }}</span>
          <span v-if="option.description" class="text-surface-500 dark:text-surface-400 text-xs">
            {{ option.description }}
          </span>
        </span>
      </label>
    </RadioGroupRoot>

    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
