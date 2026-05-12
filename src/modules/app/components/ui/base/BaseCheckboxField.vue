<script setup lang="ts">
import { useBaseCheckbox, type CheckboxProps } from '@/components/ui/base'
import { resolveIcon } from '~/config/icon-provider'

const props = withDefaults(
  defineProps<
    CheckboxProps & {
      provider: 'reka' | 'vuetify0'
    }
  >(),
  {
    size: 'md',
  },
)

defineEmits<{ 'update:modelValue': [value: boolean | 'indeterminate'] }>()

const {
  inputProps,
  labelProps,
  isChecked,
  indeterminate,
  toggle,
  errorMessageProps,
  displayError,
} = useBaseCheckbox(props)

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
  'border-surface-300 dark:border-surface-600',
  isChecked.value ? 'bg-primary-500 border-primary-500' : '',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  sizeMap[props.size],
])
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="inline-flex items-center gap-2">
      <span
        v-bind="inputProps"
        role="checkbox"
        tabindex="0"
        :class="checkboxClasses"
        data-ui="checkbox"
        :data-provider="provider"
        @click="toggle()"
        @keydown.space.prevent="toggle()"
      >
        <span v-if="isChecked" class="flex items-center justify-center text-white">
          <span
            v-if="indeterminate"
            :class="[resolveIcon('minus-circle'), indicatorSizeMap[size]]"
          />
          <span v-else :class="[resolveIcon('check'), indicatorSizeMap[size]]" />
        </span>
      </span>
      <label v-if="label" v-bind="labelProps" class="cursor-pointer text-sm select-none">
        {{ label }}
      </label>
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
  </div>
</template>
