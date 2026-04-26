<script setup lang="ts">
import { useBaseRadioGroup, type RadioGroupProps } from '@/components/ui/base'

const props = withDefaults(defineProps<RadioGroupProps>(), {
  orientation: 'vertical',
})

defineEmits<{ 'update:modelValue': [value: string] }>()

const { groupProps, labelProps, errorMessageProps, descriptionProps, displayError } =
  useBaseRadioGroup(props)
</script>

<template>
  <div class="flex flex-col gap-2" data-provider="vuetify0" data-ui="radiogroup">
    <label v-if="label" v-bind="labelProps" class="text-sm font-medium">
      {{ label }}
    </label>

    <div
      v-bind="groupProps"
      :class="orientation === 'horizontal' ? 'flex flex-wrap gap-3' : 'space-y-2'"
    >
      <V0RadioOption
        v-for="option in options"
        :key="option.value"
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

const V0RadioOption = defineComponent({
  name: 'V0RadioOption',
  props: {
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
    return h(
      'label',
      {
        class: [
          'inline-flex items-start gap-2 rounded border px-3 py-2 transition-colors',
          this.isChecked ? 'border-primary-400 bg-primary-50' : 'border-surface-200',
          this.isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ],
        ...this.labelProps,
      },
      [
        h('input', {
          ...this.inputProps,
          class: 'mt-0.5 h-4 w-4 accent-primary-500',
        }),
        h('span', { class: 'flex flex-col' }, [
          h('span', { class: 'text-sm' }, this.label),
          this.description
            ? h('span', { class: 'text-xs text-surface-500' }, this.description)
            : null,
        ]),
      ],
    )
  },
})
</script>
