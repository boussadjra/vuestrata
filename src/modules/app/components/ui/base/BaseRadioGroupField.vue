<script setup lang="ts">
import { useBaseRadioGroup, type RadioGroupProps } from '@/components/ui/base'

const props = withDefaults(
  defineProps<
    RadioGroupProps & {
      provider: 'reka' | 'vuetify0'
    }
  >(),
  {
    orientation: 'vertical',
  },
)

defineEmits<{ 'update:modelValue': [value: string] }>()

const { groupProps, labelProps, errorMessageProps, descriptionProps, displayError } =
  useBaseRadioGroup(props)

const labelClass = computed(() =>
  props.provider === 'reka'
    ? 'text-surface-700 dark:text-surface-300 text-sm font-medium'
    : 'text-sm font-medium',
)
</script>

<template>
  <div class="flex flex-col gap-2" :data-provider="provider" data-ui="radiogroup">
    <div v-if="label" v-bind="labelProps" :class="labelClass">
      {{ label }}
    </div>

    <div
      v-bind="groupProps"
      :class="orientation === 'horizontal' ? 'flex flex-wrap gap-3' : 'space-y-2'"
    >
      <BaseRadioOption
        v-for="option in options"
        :key="option.value"
        :provider="provider"
        :value="option.value"
        :label="option.label"
        :disabled="option.disabled || disabled"
        :description="option.description"
        :model-value="modelValue"
      />
    </div>

    <p v-if="displayError" v-bind="errorMessageProps" class="text-xs text-red-500" role="alert">
      {{ displayError }}
    </p>
    <p v-else-if="hint || description" v-bind="descriptionProps" class="text-surface-500 text-xs">
      {{ hint || description }}
    </p>
  </div>
</template>

<script lang="ts">
import { useRadio as useFormwerkRadio } from '@formwerk/core'
import { defineComponent, h } from 'vue'

const BaseRadioOption = defineComponent({
  name: 'BaseRadioOption',
  props: {
    provider: { type: String as () => 'reka' | 'vuetify0', required: true },
    value: { type: String, required: true },
    label: { type: String, required: true },
    disabled: { type: Boolean, default: false },
    description: { type: String, default: undefined },
    modelValue: { type: String, default: undefined },
  },
  setup(props) {
    const { inputProps, labelProps, isChecked, isDisabled } = useFormwerkRadio({
      value: () => props.value,
      label: () => props.label,
      disabled: () => props.disabled,
    })

    return { inputProps, labelProps, isChecked, isDisabled }
  },
  render() {
    const className =
      this.provider === 'reka'
        ? [
            'inline-flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors',
            this.isChecked
              ? 'border-primary-400 bg-primary-50 dark:border-primary-600 dark:bg-primary-900/25'
              : 'border-surface-200 dark:border-surface-700',
            this.isDisabled
              ? 'opacity-50 cursor-not-allowed'
              : 'cursor-pointer hover:border-surface-300 dark:hover:border-surface-600',
          ]
        : [
            'inline-flex items-start gap-2 rounded border px-3 py-2 transition-colors',
            this.isChecked ? 'border-primary-400 bg-primary-50' : 'border-surface-200',
            this.isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          ]

    const textClass =
      this.provider === 'reka' ? 'text-sm text-surface-700 dark:text-surface-300' : 'text-sm'

    return h(
      'label',
      {
        class: className,
        ...this.labelProps,
      },
      [
        h('input', {
          ...this.inputProps,
          class: 'mt-0.5 h-4 w-4 accent-primary-500',
        }),
        h('span', { class: 'flex flex-col' }, [
          h('span', { class: textClass }, this.label),
          this.description
            ? h('span', { class: 'text-xs text-surface-500' }, this.description)
            : null,
        ]),
      ],
    )
  },
})
</script>
