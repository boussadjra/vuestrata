<script setup lang="ts">
import { useBaseSelect, type SelectProps } from '@/components/ui/base'

import V0Option from './V0Option.vue'
import V0OptionGroup from './V0OptionGroup.vue'

const props = withDefaults(defineProps<SelectProps>(), {
  placeholder: 'Select...',
  size: 'md',
})

defineEmits<{ 'update:modelValue': [value: string | string[]] }>()

const {
  triggerProps,
  listBoxProps,
  labelProps,
  errorMessageProps,
  descriptionProps,
  displayError,
  isOpen,
  selectedOption,
} = useBaseSelect(props)

function isGroup(
  opt: (typeof props.options)[number],
): opt is { label: string; options: { label: string; value: string; disabled?: boolean }[] } {
  return 'options' in opt
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
      <span v-if="required" class="ml-0.5 text-red-500">*</span>
    </label>
    <div class="relative">
      <button
        v-bind="triggerProps"
        type="button"
        class="w-full rounded border px-3 py-2 text-left text-sm"
        data-ui="select"
        data-provider="vuetify0"
      >
        <span v-if="selectedOption">{{ selectedOption.label }}</span>
        <span v-else class="text-surface-400">{{ placeholder }}</span>
      </button>
      <div
        v-show="isOpen"
        v-bind="listBoxProps"
        class="dark:bg-surface-800 absolute z-50 mt-1 w-full rounded border bg-white p-1 shadow"
      >
        <template v-for="option in options" :key="'value' in option ? option.value : option.label">
          <V0OptionGroup v-if="isGroup(option)" :label="option.label">
            <V0Option
              v-for="child in option.options"
              :key="child.value"
              :label="child.label"
              :value="child.value"
              :disabled="child.disabled"
            />
          </V0OptionGroup>
          <V0Option
            v-else
            :label="option.label"
            :value="option.value"
            :disabled="option.disabled"
          />
        </template>
      </div>
    </div>
    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>
