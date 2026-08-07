<script setup lang="ts">
import { useFormGroup } from '@formwerk/core'

import type { FormGroupProps } from '~/types/forms'

const props = withDefaults(defineProps<FormGroupProps>(), {
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
  <fieldset v-bind="groupProps" class="flex flex-col gap-3">
    <legend v-if="label" v-bind="labelProps" class="text-foreground mb-1 text-sm font-semibold">
      {{ label }}
    </legend>
    <slot
      :is-dirty="isDirty"
      :is-valid="isValid"
      :is-touched="isTouched"
      :is-disabled="isDisabled"
      :errors="getErrors()"
    />
  </fieldset>
</template>
