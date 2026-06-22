<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'

import { useUiCheckbox, type CheckboxProps } from '@/composables/forms'
import { resolveIcon } from '~/config/icon-provider'

import { fieldErrorMessageClass, invalidCheckboxClass } from './validationPresentation'

const props = withDefaults(
  defineProps<
    CheckboxProps & {
      provider?: 'reka'
    }
  >(),
  {
    provider: 'reka',
    modelValue: undefined,
    trueValue: undefined,
    falseValue: undefined,
    indeterminate: undefined,
    size: 'md',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean | 'indeterminate']
  change: [value: boolean | 'indeterminate']
}>()

const { inputProps, labelProps, isChecked, toggle, errorMessageProps, displayError } =
  useUiCheckbox(props)

function emitToggle() {
  if (props.disabled || props.readonly || isIndeterminate.value) return
  const currentValue = props.modelValue ?? props.checked ?? isChecked.value
  const nextValue = !currentValue
  emit('update:modelValue', nextValue)
  emit('change', nextValue)
}

function handleLabelClick() {
  toggle()
  emitToggle()
}

const isIndeterminate = computed(
  () => props.indeterminate === true || props.modelValue === 'indeterminate',
)

const sizeMap: Record<string, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}

const indicatorSizeMap: Record<string, string> = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
  lg: 'h-4 w-4',
}

const checkboxClasses = computed(() => [
  'inline-flex items-center justify-center rounded border-2 transition-colors',
  displayError.value
    ? invalidCheckboxClass
    : 'border-surface-300 dark:border-surface-600 focus-visible:ring-primary-300',
  isChecked.value ? 'bg-primary-700 border-primary-700' : '',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  sizeMap[props.size],
])
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="inline-flex items-center gap-2">
      <CheckboxRoot
        v-bind="inputProps"
        :class="checkboxClasses"
        data-ui="checkbox"
        :data-provider="provider"
        @click="emitToggle"
        @keydown.space.prevent="emitToggle"
      >
        <CheckboxIndicator class="flex items-center justify-center text-white">
          <span
            v-if="isIndeterminate"
            :class="[resolveIcon('minus-circle'), indicatorSizeMap[size]]"
          />
          <span v-else :class="[resolveIcon('check'), indicatorSizeMap[size]]" />
        </CheckboxIndicator>
      </CheckboxRoot>
      <span
        v-if="label"
        v-bind="labelProps"
        class="cursor-pointer text-sm select-none"
        @click="handleLabelClick"
      >
        {{ label }}
      </span>
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" :class="fieldErrorMessageClass" role="alert">
      {{ displayError }}
    </p>
  </div>
</template>
