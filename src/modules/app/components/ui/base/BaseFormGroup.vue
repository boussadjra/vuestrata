<script setup lang="ts">
import { useFormGroup } from '@formwerk/core'

import type { FormGroupProps } from '~/types/forms'

const props = withDefaults(defineProps<FormGroupProps & { legendClass?: string }>(), {
  disabled: false,
})

const { groupProps, labelProps, isDirty, isValid, isTouched, isDisabled, getErrors } = useFormGroup(
  {
    name: () => props.name,
    label: () => props.label,
    schema: props.schema as never,
    disabled: () => props.disabled,
  },
)
</script>

<template>
  <fieldset v-bind="groupProps">
    <legend v-if="label" v-bind="labelProps" :class="legendClass">{{ label }}</legend>
    <slot
      :is-dirty="isDirty"
      :is-valid="isValid"
      :is-touched="isTouched"
      :is-disabled="isDisabled"
      :errors="getErrors()"
    />
  </fieldset>
</template>
