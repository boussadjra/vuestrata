<script setup lang="ts">
import { useForm } from '@formwerk/core'

import type { FormProps } from '~/types/forms'

const props = withDefaults(defineProps<FormProps>(), {
  disabled: false,
  disableHtmlValidation: true,
})

const emit = defineEmits<{
  submit: [values: Record<string, unknown>]
}>()

const formOptions = props.schema
  ? {
      schema: props.schema,
      initialValues: props.initialValues,
      disabled: props.disabled,
      disableHtmlValidation: props.disableHtmlValidation,
    }
  : {
      initialValues: props.initialValues,
      disabled: props.disabled,
      disableHtmlValidation: props.disableHtmlValidation,
    }

const { values, handleSubmit, isSubmitting, wasSubmitted, isDirty, isTouched, isValid, context } =
  useForm(formOptions as Parameters<typeof useForm>[0])

const onSubmit = handleSubmit((data) => {
  emit('submit', data.toObject())
})

defineExpose({ values, context, isSubmitting, wasSubmitted, isDirty, isTouched, isValid })
</script>

<template>
  <form :novalidate="disableHtmlValidation" class="flex flex-col gap-4" @submit.prevent="onSubmit">
    <slot
      :values="values"
      :is-submitting="isSubmitting"
      :was-submitted="wasSubmitted"
      :is-dirty="isDirty()"
      :is-touched="isTouched()"
      :is-valid="isValid()"
    />
  </form>
</template>
