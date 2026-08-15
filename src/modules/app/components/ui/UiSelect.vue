<script setup lang="ts">
import {
  SelectContent,
  SelectIcon,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectViewport,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'

import { useUiSelect, type SelectProps } from '@/composables/forms'
import {
  fieldErrorMessageClass,
  fieldRequiredIndicatorClass,
  invalidSelectTriggerClass,
} from '@/utils/validationPresentation'

import UiOption from './UiOption.vue'
import UiOptionGroup from './UiOptionGroup.vue'

const props = defineProps<SelectProps>()

defineOptions({
  inheritAttrs: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number | Array<string | number>]
}>()

const attrs = useAttrs()
const { t } = useI18n()
const formwerk = useUiSelect(props)

const { labelProps, errorMessageProps, descriptionProps, displayError, fieldValue, setValue } =
  formwerk

const placeholderText = computed(() => props.placeholder ?? t('common_select'))
const controlId = computed(() => props.id ?? formwerk.controlId)
const errorId = computed(() => (controlId.value ? `${controlId.value}-e` : undefined))
const descriptionId = computed(() => (controlId.value ? `${controlId.value}-d` : undefined))

const enhancedLabelProps = computed(() => ({ ...labelProps.value, for: controlId.value }))

const enhancedErrorMessageProps = computed(() => {
  if (!errorId.value) return errorMessageProps.value
  return { ...errorMessageProps.value, id: errorId.value }
})

const enhancedDescriptionProps = computed(() => {
  if (!descriptionId.value) return descriptionProps.value
  return { ...descriptionProps.value, id: descriptionId.value }
})

const triggerAttrs = computed(() => ({
  ...Object.fromEntries(
    Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style'),
  ),
  id: controlId.value,
  'aria-errormessage': displayError.value ? errorId.value : undefined,
  'aria-describedby':
    !displayError.value && (props.hint || props.description) ? descriptionId.value : undefined,
}))

function isGroup(
  opt: (typeof props.options)[number],
): opt is { label: string; options: { label: string; value: string; disabled?: boolean }[] } {
  return 'options' in opt
}

function isSingleOption(
  opt: (typeof props.options)[number],
): opt is { label: string; value: string | number; disabled?: boolean } {
  return 'value' in opt
}

const currentValue = computed(() => {
  if (props.multiple) {
    if (Array.isArray(fieldValue.value)) return fieldValue.value
    if (Array.isArray(props.modelValue)) return props.modelValue
    return []
  }

  if (Array.isArray(fieldValue.value)) return fieldValue.value[0]

  return fieldValue.value ?? props.modelValue
})

const optionLabels = computed(() => {
  const labels = new Map<string | number, string>()

  for (const option of props.options) {
    if (isGroup(option)) {
      for (const child of option.options) {
        labels.set(child.value, child.label)
      }
      continue
    }

    if (isSingleOption(option)) {
      labels.set(option.value, option.label)
    }
  }

  return labels
})

const selectedLabel = computed(() => {
  if (props.multiple) {
    const values = Array.isArray(currentValue.value) ? currentValue.value : []
    return values.map((value) => optionLabels.value.get(value) ?? String(value)).join(', ')
  }

  if (
    currentValue.value === undefined ||
    currentValue.value === null ||
    currentValue.value === ''
  ) {
    return ''
  }

  return optionLabels.value.get(currentValue.value as string | number) ?? String(currentValue.value)
})

const hasSelection = computed(() =>
  props.multiple
    ? Array.isArray(currentValue.value) && currentValue.value.length > 0
    : currentValue.value !== undefined && currentValue.value !== null && currentValue.value !== '',
)

function onValueChange(value: string | number | Array<string | number>) {
  setValue(value)
  emit('update:modelValue', value)
}

const triggerClasses = computed(() => [
  'shaped-border shaped-radius-sm inline-flex h-[var(--control-height)] w-full min-w-0 items-center justify-between border px-3 text-sm leading-5',
  'bg-card text-foreground',
  displayError.value ? invalidSelectTriggerClass : 'border-surface-300 dark:border-surface-600',
  'hover:border-surface-400 dark:hover:border-surface-500',
  'focus:outline-none focus:ring-2 focus:ring-primary-300',
  'disabled:cursor-not-allowed disabled:opacity-50',
])
</script>

<template>
  <div class="flex flex-col gap-1" :class="attrs.class" :style="attrs.style">
    <label v-if="label" v-bind="enhancedLabelProps" class="text-foreground text-sm font-medium">
      {{ label }}
      <span v-if="required" :class="fieldRequiredIndicatorClass">*</span>
    </label>

    <SelectRoot
      :model-value="currentValue"
      :multiple="multiple"
      :disabled="disabled"
      :required="required"
      :name="name"
      @update:model-value="onValueChange"
    >
      <SelectTrigger
        v-bind="triggerAttrs"
        :class="triggerClasses"
        data-provider="reka"
        data-ui="select"
      >
        <span v-if="hasSelection" class="truncate">{{ selectedLabel }}</span>
        <span v-else class="text-muted-foreground truncate">{{ placeholderText }}</span>
        <SelectIcon class="text-muted-foreground ms-2 text-xs">▼</SelectIcon>
      </SelectTrigger>

      <SelectPortal>
        <SelectContent
          class="shaped-border shaped-radius shaped-shadow border-surface-200 dark:border-surface-700 dark:bg-surface-800 z-50 w-auto min-w-45 overflow-hidden border bg-white p-1"
          position="popper"
          :side-offset="4"
        >
          <SelectViewport>
            <template
              v-for="option in options"
              :key="'value' in option ? option.value : option.label"
            >
              <UiOptionGroup v-if="isGroup(option)" :label="option.label">
                <UiOption
                  v-for="child in option.options"
                  :key="child.value"
                  :label="child.label"
                  :value="child.value"
                  :disabled="child.disabled"
                />
              </UiOptionGroup>
              <UiOption
                v-else-if="isSingleOption(option)"
                :label="option.label"
                :value="option.value"
                :disabled="option.disabled"
              />
            </template>
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>

    <p
      v-if="displayError"
      v-bind="enhancedErrorMessageProps"
      :class="fieldErrorMessageClass"
      role="alert"
    >
      {{ displayError }}
    </p>
    <p
      v-else-if="hint || description"
      v-bind="enhancedDescriptionProps"
      class="text-muted-foreground text-xs"
    >
      {{ hint || description }}
    </p>
  </div>
</template>
