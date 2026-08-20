<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'

import { useUiCheckbox, useFormwerkElementRef, type CheckboxProps } from '@/composables/forms'
import { resolveIcon } from '~/config/icon-provider'
import { fieldErrorMessageClass, invalidCheckboxClass } from '~/utils/validationPresentation'

const props = withDefaults(
  defineProps<
    CheckboxProps & {
      provider?: 'reka'
      ariaLabel?: string
      /** Icon shown when checked. Select-all uses `checks` (double mark). */
      checkedIcon?: 'check' | 'checks'
    }
  >(),
  {
    provider: 'reka',
    modelValue: undefined,
    trueValue: undefined,
    falseValue: undefined,
    indeterminate: undefined,
    size: 'md',
    checkedIcon: 'check',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean | 'indeterminate']
  change: [value: boolean | 'indeterminate']
}>()

const { inputProps, labelProps, isChecked, toggle, errorMessageProps, displayError } =
  useUiCheckbox(props)

// CheckboxRoot is a component, so Formwerk's element-capturing ref cannot be
// spread onto it directly — see useFormwerkElementRef.
const { attrs: formwerkAttrs, captureElement } = useFormwerkElementRef(inputProps)

function emitToggle() {
  if (props.disabled || props.readonly) return
  const currentValue = props.modelValue ?? props.checked ?? isChecked.value
  const nextValue = isIndeterminate.value ? true : !currentValue
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

/**
 * Reka only mounts the indicator when `model-value` is set. Formwerk `inputProps`
 * do not keep that in sync for controlled table cells, so a selected row was
 * painted as a solid square with no mark.
 */
const visuallyChecked = computed(() => {
  if (typeof props.modelValue === 'boolean') return props.modelValue
  if (typeof props.checked === 'boolean') return props.checked
  return Boolean(isChecked.value)
})

const rekaChecked = computed(() =>
  isIndeterminate.value ? 'indeterminate' : visuallyChecked.value,
)

/**
 * Formwerk's `aria-checked` reports its own field state, which is stale for a
 * controlled checkbox — a caller passing `:model-value` (the permissions panel
 * does, 65 times) got `aria-checked="false"` on every checked box. Because
 * fallthrough attrs beat the ones a component renders itself, that stale value
 * also overrode the correct one CheckboxRoot derives from `:checked`.
 *
 * Dropping it lets Reka own the attribute, which is the accessibility
 * primitive's job. `rekaChecked` already resolves controlled and uncontrolled
 * alike, so the uncontrolled case is unaffected. Bound via `model-value`
 * because Reka v2's CheckboxRoot has no `checked` prop.
 */
const checkboxAttrs = computed(() => {
  const { 'aria-checked': _stale, ...rest } = formwerkAttrs.value as Record<string, unknown>
  return rest
})

const hasVisibleLabel = computed(() => Boolean(props.label))

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
  'inline-flex shrink-0 items-center justify-center overflow-hidden rounded border-2 transition-colors',
  displayError.value
    ? invalidCheckboxClass
    : 'border-surface-300 dark:border-surface-600 focus-visible:ring-primary-300',
  isIndeterminate.value || visuallyChecked.value ? 'bg-primary-700 border-primary-700' : '',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  sizeMap[props.size],
])
</script>

<template>
  <div :class="hasVisibleLabel || displayError ? 'flex flex-col gap-1' : 'contents'">
    <div :class="hasVisibleLabel ? 'inline-flex items-center gap-2' : 'contents'">
      <!--
        `model-value`, not `checked`: Reka v2's CheckboxRoot has no `checked`
        prop, so the old binding fell through as a dead HTML attribute and Reka
        rendered `aria-checked="false"` / `data-state="unchecked"` on every
        checkbox in the app, whatever its real state.
      -->
      <CheckboxRoot
        v-bind="checkboxAttrs"
        :ref="captureElement"
        :model-value="rekaChecked"
        :class="checkboxClasses"
        :aria-label="ariaLabel || undefined"
        data-ui="checkbox"
        :data-provider="provider"
        @click="emitToggle"
        @keydown.space.prevent="emitToggle"
      >
        <CheckboxIndicator
          class="flex items-center justify-center text-white"
          :force-mount="rekaChecked !== false"
        >
          <span
            v-if="isIndeterminate"
            class="h-0.5 w-2.5 rounded-full bg-white"
            aria-hidden="true"
          />
          <span v-else :class="[resolveIcon(checkedIcon), 'text-white', indicatorSizeMap[size]]" />
        </CheckboxIndicator>
      </CheckboxRoot>
      <span
        v-if="hasVisibleLabel"
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
